import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRO_PRICING } from '@/lib/stripe';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';
import { take, type Bucket } from '@/lib/rate-limit';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

export const runtime = 'nodejs';

// Per-user limit on invoice creation. A logged-in attacker (or a runaway
// client retry loop) could otherwise spam thousands of CryptoPayment rows and
// burn through NOWPayments' invoice quota. 10 per hour per user is generous
// — a real customer needs ~1 click to start a checkout.
const hits = new Map<string, Bucket>();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 404 });

  if (!take(hits, userId, { max: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many checkouts — try again in a few minutes.' }, { status: 429 });
  }

  let plan: 'monthly' | 'yearly' = 'monthly';
  try {
    const body = await req.json();
    if (body?.plan === 'yearly') plan = 'yearly';
  } catch { /* default monthly */ }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Crypto payments are not configured' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const amount = PRO_PRICING[plan];
  const planLabel = plan === 'yearly' ? `${BRAND} Pro — Yearly` : `${BRAND} Pro — Monthly`;
  const orderId = `xonvert_${userId}_${plan}_${Date.now()}`;
  const baseUrl = process.env.NEXTAUTH_URL || `https://${BRAND_DOMAIN}`;

  // Hard timeout on the NOWPayments call — without this, a hung upstream
  // hangs every "subscribe with crypto" click until next.js' default 30s
  // request timeout, freezing the checkout button.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let response: Response;
  let result: { id?: string | number; invoice_url?: string };
  try {
    response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        order_id: orderId,
        order_description: planLabel,
        ipn_callback_url: `${baseUrl}/api/crypto/webhook`,
        success_url: `${baseUrl}/account?upgraded=crypto`,
        cancel_url: `${baseUrl}/pricing`,
      }),
      signal: ctrl.signal,
    });
    result = await response.json();
  } catch {
    return NextResponse.json({ error: 'Crypto payment provider is temporarily unavailable.' }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || !result.id) {
    console.error('[NOWPayments] Invoice creation failed:', result);
    return NextResponse.json({ error: 'Failed to create crypto payment' }, { status: 500 });
  }

  await prisma.cryptoPayment.create({
    data: {
      userId,
      paymentId: result.id.toString(),
      orderId,
      planType: plan,
      amount,
      status: 'pending',
      metadata: { email: user.email },
    },
  });

  return NextResponse.json({ url: result.invoice_url, paymentId: result.id.toString() });
}
