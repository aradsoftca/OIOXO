import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe, priceIdForBilling } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { take, type Bucket } from '@/lib/rate-limit';

// Per-user limit on checkout-session creation. Mirrors the crypto/create-payment
// limit. A logged-in attacker (or a runaway client retry loop) could otherwise
// burn through Stripe's per-account API quota and spam dozens of half-completed
// sessions. 10/hour is generous — a real customer needs ~1 click to start
// checkout.
const hits = new Map<string, Bucket>();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const uid = (session.user as { id?: string }).id;
  if (uid && !take(hits, uid, { max: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many checkouts — try again in a few minutes.' }, { status: 429 });
  }

  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user) return NextResponse.json({ error: 'no user' }, { status: 404 });

  let billing: 'monthly' | 'yearly' = 'monthly';
  try {
    const body = await req.json();
    if (body?.billing === 'yearly') billing = 'yearly';
  } catch { /* default monthly */ }

  const price = priceIdForBilling(billing);
  if (!price) return NextResponse.json({ error: 'price not configured' }, { status: 500 });

  // The Origin header is attacker-controlled — a hostile client can set
  // Origin: https://evil.com and the success/cancel redirect URLs Stripe
  // hands back would point at the attacker. Pin to the configured app URL,
  // falling back to a hard-coded localhost only in dev.
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3001';
  const origin = appUrl.replace(/\/+$/, '');
  const checkout = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email ?? undefined,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    allow_promotion_codes: true,
    // Carry our user id into the session + the subscription it creates so the
    // webhook can match by id even if the user later changes their email
    // (previously the webhook keyed off `cs.customer_email` and would lose
    // the user on email change).
    client_reference_id: user.id,
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
  });

  return NextResponse.json({ url: checkout.url });
}
