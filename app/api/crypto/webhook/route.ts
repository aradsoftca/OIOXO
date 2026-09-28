import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { countFunnel } from '@/lib/funnel-server';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';

/**
 * NOWPayments IPN webhook. Validates the HMAC-SHA512 signature, then upgrades
 * the user to PRO on confirmed/finished payments (idempotent).
 */
export async function POST(req: Request) {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  const signature = req.headers.get('x-nowpayments-sig');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  const hash = crypto
    .createHmac('sha512', ipnSecret)
    .update(JSON.stringify(sortObject(payload)))
    .digest('hex');
  const sigBuf = Buffer.from(signature);
  const hashBuf = Buffer.from(hash);
  if (sigBuf.length !== hashBuf.length || !crypto.timingSafeEqual(hashBuf, sigBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const status = String(payload.payment_status ?? '');
  const orderId = payload.order_id ? String(payload.order_id) : '';

  try {
    if (status === 'finished' || status === 'confirmed') {
      await activate(orderId, payload);
    } else if (orderId) {
      await prisma.cryptoPayment.updateMany({
        where: { orderId },
        data: { status, providerStatus: status },
      });
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[NOWPayments Webhook] Error:', e);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

function sortObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
      return sorted;
    }, {});
}

async function activate(orderId: string, payload: Record<string, unknown>) {
  if (!orderId) return;
  const pending = await prisma.cryptoPayment.findFirst({
    where: { orderId, status: { not: 'completed' } },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) return; // already completed or unknown order

  const endDate = new Date();
  if (pending.planType === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
  else endDate.setMonth(endDate.getMonth() + 1);

  // Atomic transition guard: NOWPayments retries on failure / timeout, and two
  // concurrent webhook deliveries for the same order would both see status !=
  // 'completed', both run the transaction, and both create a Payment row →
  // double-billing in the user's history. Use updateMany with the not-completed
  // filter so only ONE webhook actually flips status; if the update affected
  // zero rows, another worker beat us and we exit without creating a payment.
  const claimed = await prisma.cryptoPayment.updateMany({
    where: { id: pending.id, status: { not: 'completed' } },
    data: {
      status: 'completed',
      providerStatus: String(payload.payment_status ?? ''),
      transactionId: payload.payment_id ? String(payload.payment_id) : null,
      payCurrency: payload.pay_currency ? String(payload.pay_currency) : null,
      completedAt: new Date(),
    },
  });
  if (claimed.count === 0) return; // lost the race — another worker already activated

  await prisma.$transaction([
    prisma.user.update({
      where: { id: pending.userId },
      data: { plan: 'PRO', subscriptionStatus: 'ACTIVE', subscriptionEndsAt: endDate },
    }),
    prisma.payment.create({
      data: {
        userId: pending.userId,
        amount: pending.amount,
        currency: 'usd',
        status: 'SUCCEEDED',
        paymentMethod: 'crypto',
        plan: 'PRO',
        billingPeriod: pending.planType,
        description: `${BRAND} Pro (${pending.planType}) — Crypto payment`,
        paidAt: new Date(),
        metadata: {
          provider: 'nowpayments',
          orderId,
          paymentId: payload.payment_id ? String(payload.payment_id) : null,
          payCurrency: payload.pay_currency ? String(payload.pay_currency) : null,
        },
      },
    }),
  ]);
  await countFunnel('paid');
}
