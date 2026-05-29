import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Per-user rate limit on billing-portal session creation. Mirrors the
// checkout route — a runaway client retry loop (or hostile user) could
// otherwise burn Stripe API quota at 10s of req/s.
const hits = new Map<string, Bucket>();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const uid = (session.user as { id?: string }).id;
  if (uid && !take(hits, uid, { max: 20, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many portal opens — try again in a few minutes.' }, { status: 429 });
  }
  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, select: { stripeCustomerId: true } })
    : null;
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'no billing account' }, { status: 400 });
  }

  // Origin header is client-controlled — pin to NEXTAUTH_URL so a hostile
  // request can't redirect users to evil.com/account after they finish in
  // the Stripe billing portal.
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3001';
  const origin = appUrl.replace(/\/+$/, '');
  const portal = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/account`,
  });
  return NextResponse.json({ url: portal.url });
}
