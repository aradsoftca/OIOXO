import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GPU bridge — enqueue a job on the Iceland 1080Ti queue.
 *
 * Phase 0 stub. Phase 7 will:
 *   1. Validate the user is PRO (or rate-limit anon via Turnstile)
 *   2. Sign a PUT URL for R2 (or local upload endpoint)
 *   3. Push job to Redis Streams visible to the Iceland worker
 *   4. Return job id + poll URL
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user ? (session.user as { id?: string }).id : null;

  const body = (await req.json().catch(() => null)) as { model?: string } | null;
  if (!body?.model) return NextResponse.json({ error: 'model required' }, { status: 400 });

  if (uid) {
    const user = await prisma.user.findUnique({ where: { id: uid }, select: { plan: true, subscriptionEndsAt: true } });
    // Fail-safe: if Stripe's subscription.deleted webhook missed, the stored
    // plan stays PRO forever. Treat a firmly-past period end as expired.
    const expired = user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now();
    if (!user || expired || user.plan !== 'PRO') {
      return NextResponse.json(
        { error: 'pro_required', message: 'Pro Quality requires an active Pro subscription.' },
        { status: 402 },
      );
    }
  } else {
    // anonymous — return a friendly error until Turnstile + rate limits land
    return NextResponse.json(
      { error: 'sign_in_required', message: 'Sign in to use Pro Quality.' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    jobId: `stub_${crypto.randomUUID()}`,
    status: 'not_implemented',
    message: 'GPU bridge ships in Phase 7. This is the contract endpoint.',
  });
}
