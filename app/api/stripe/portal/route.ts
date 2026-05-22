import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const uid = (session.user as { id?: string }).id;
  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, select: { stripeCustomerId: true } })
    : null;
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'no billing account' }, { status: 400 });
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3001';
  const portal = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/account`,
  });
  return NextResponse.json({ url: portal.url });
}
