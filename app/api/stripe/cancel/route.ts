import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Per-user rate limit on cancel/resume. Without this, a misbehaving client could
// flap cancel↔resume in a loop, hammering Stripe's subscriptions.update endpoint
// (each call counts toward the per-account quota) and littering the
// SubscriptionCancellation table with churn rows. 10/hour is generous — a real
// user toggles cancel ~once.
const hits = new Map<string, Bucket>();

/**
 * Cancel (or resume) the Pro subscription — GUARANTEED at period end.
 *
 * POST {} → schedule cancellation: `cancel_at_period_end = true`. Stripe keeps the
 * subscription `active` until the paid period ends, so the webhook keeps plan=PRO
 * until then; only `customer.subscription.deleted` (which fires at period end)
 * downgrades to FREE. So the user keeps Pro for the full cycle they paid for, with
 * no further charge — exactly the refund/cancellation policy, enforced in code (not
 * dependent on the Stripe dashboard's portal config).
 *
 * POST { resume: true } → undo a scheduled cancellation (`cancel_at_period_end = false`).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!take(hits, uid, { max: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests — try again in a few minutes.' }, { status: 429 });
  }

  let body: { resume?: boolean } = {};
  try { body = await req.json(); } catch { /* default = cancel */ }
  const resume = body.resume === true;

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { stripeSubscriptionId: true },
  });
  if (!user?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'no active subscription' }, { status: 400 });
  }

  try {
    const sub = await getStripe().subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: !resume,
    });
    const end =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
      null;

    if (!resume) {
      // Record the cancellation request (best-effort) for support/analytics.
      await prisma.subscriptionCancellation
        .create({ data: { userId: uid, plan: 'PRO', reason: 'user-requested' } })
        .catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: !resume,
      endsAt: end ? new Date(end * 1000).toISOString() : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'could not update subscription' }, { status: 500 });
  }
}
