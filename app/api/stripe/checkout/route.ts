import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe, priceIdForBilling } from '@/lib/stripe';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const uid = (session.user as { id?: string }).id;
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user) return NextResponse.json({ error: 'no user' }, { status: 404 });

  let billing: 'monthly' | 'yearly' = 'monthly';
  try {
    const body = await req.json();
    if (body?.billing === 'yearly') billing = 'yearly';
  } catch { /* default monthly */ }

  const price = priceIdForBilling(billing);
  if (!price) return NextResponse.json({ error: 'price not configured' }, { status: 500 });

  const origin = req.headers.get('origin') ?? 'http://localhost:3001';
  const checkout = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email ?? undefined,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkout.url });
}
