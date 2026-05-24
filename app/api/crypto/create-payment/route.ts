import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRO_PRICING } from '@/lib/stripe';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 404 });

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

  const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
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
  });
  const result = await response.json();
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
