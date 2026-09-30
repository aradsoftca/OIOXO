import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// In-app account deletion (App Store 5.1.1(v) / Play data-safety). 5/hour per user.
const hits = new Map<string, Bucket>();

/**
 * POST { confirm: "DELETE" } → delete the signed-in user's account.
 *
 * Deleted: sign-in connections (Account), sessions, API keys, mesh device keys + credit
 * days, per-account usage counts, subscription-cancellation history, support tickets
 * (+ their messages) and the email log for the account.
 *
 * Kept (tax law): Payment + CryptoPayment rows. Their `userId` is required and
 * cascades from User, so a hard delete would erase them. When any exist, the User row
 * is instead scrubbed into an anonymous tombstone (no email/name/password/image/
 * login data, plan FREE) that only anchors those records. With no payments the
 * User row is deleted outright.
 *
 * Stripe: an active subscription is set to cancel at period end first (no further
 * charges). stripeCustomerId/stripeSubscriptionId are kept on the tombstone so billing
 * can still be reconciled.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!take(hits, uid, { max: 5, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests — try again later.' }, { status: 429 });
  }

  let body: { confirm?: unknown } = {};
  try { body = await req.json(); } catch { /* invalid body → rejected below */ }
  if (body.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, stripeSubscriptionId: true } });
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  // A deleted account must never be charged again: stop the Stripe subscription at the
  // end of the paid period (no refund — same policy as /api/stripe/cancel).
  if (user.stripeSubscriptionId) {
    try {
      await getStripe().subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Already cancelled / missing is fine; anything else → don't delete a still-billing account.
      if (code !== 'resource_missing') {
        return NextResponse.json({ error: 'Could not stop your subscription — please try again or contact support.' }, { status: 502 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId: uid } });
    await tx.session.deleteMany({ where: { userId: uid } });
    await tx.apiKey.deleteMany({ where: { userId: uid } });
    await tx.deviceKey.deleteMany({ where: { userId: uid } });
    await tx.meshCreditDay.deleteMany({ where: { userId: uid } });
    await tx.categoryUsage.deleteMany({ where: { userId: uid } });
    await tx.subscriptionCancellation.deleteMany({ where: { userId: uid } });
    await tx.ticket.deleteMany({ where: { userId: uid } }); // TicketMessage cascades
    await tx.email.deleteMany({ where: { userId: uid } });

    const [payments, cryptos] = await Promise.all([
      tx.payment.count({ where: { userId: uid } }),
      tx.cryptoPayment.count({ where: { userId: uid } }),
    ]);

    if (payments + cryptos === 0) {
      await tx.user.delete({ where: { id: uid } });
    } else {
      await tx.user.update({
        where: { id: uid },
        data: {
          email: null,
          password: null,
          name: null,
          image: null,
          emailVerified: null,
          plan: 'FREE',
          role: 'USER',
          subscriptionStatus: 'INACTIVE',
          dailyConversionLimit: null,
          maxFileSize: null,
          deviceFingerprint: null,
          lastLoginAt: null,
          lastLoginIp: null,
          resetToken: null,
          resetTokenExpiry: null,
          marketingOptOut: true,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
