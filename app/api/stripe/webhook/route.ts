import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { getStripe, STRIPE_PRODUCT } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { countFunnel } from '@/lib/funnel-server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature');
  if (!sig) return new NextResponse('missing signature', { status: 400 });

  // Fail-closed if the webhook signing secret isn't configured. Passing an
  // empty string to constructEvent depends on the Stripe SDK's internal
  // handling — defensive: explicit 503 means we never accept a webhook we
  // can't actually verify (which would let an attacker forge plan upgrades).
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new NextResponse('webhook secret not configured', { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new NextResponse(`bad signature: ${(err as Error).message}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const cs = event.data.object as Stripe.Checkout.Session;
      // Shared Stripe account: only act on this product's checkouts.
      if (cs.metadata?.product !== STRIPE_PRODUCT) break;
      if (cs.customer && cs.subscription) {
        // Prefer the user id stamped into the session metadata at checkout
        // creation; fall back to client_reference_id; fall back to email.
        const userId = (cs.metadata?.userId as string | undefined) ?? cs.client_reference_id ?? null;
        // Mirror the crypto webhook: set subscriptionStatus to ACTIVE on
        // activation. The schema defaults to INACTIVE, which was leaving
        // Stripe-paid Pro users with "Status: inactive" displayed on their
        // account page (the field was being read by the UI but never written
        // by this webhook). The crypto webhook already writes ACTIVE here.
        const data = {
          plan: 'PRO' as const,
          subscriptionStatus: 'ACTIVE' as const,
          stripeCustomerId: typeof cs.customer === 'string' ? cs.customer : cs.customer.id,
          stripeSubscriptionId:
            typeof cs.subscription === 'string' ? cs.subscription : cs.subscription.id,
        };
        // Try userId first, then fall back to email. updateMany never throws
        // on "record not found", so a stale metadata.userId (deleted account)
        // can't strand the whole webhook in a retry loop while the email
        // fallback never gets a chance to run.
        let updated = 0;
        if (userId) {
          const r = await prisma.user.updateMany({ where: { id: userId }, data });
          updated = r.count;
        }
        if (!updated && cs.customer_email) {
          await prisma.user.updateMany({ where: { email: cs.customer_email }, data });
        }
        await countFunnel('paid');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { plan: 'FREE', subscriptionStatus: 'CANCELLED', stripeSubscriptionId: null },
      });
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      // Stripe moved current_period_end across SDK versions. Try both shapes.
      const periodEnd =
        (sub as unknown as { current_period_end?: number }).current_period_end ??
        (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)
          ?.current_period_end;
      // `past_due` and `unpaid` are TRANSIENT — Stripe retries the charge
      // over 1–3 weeks before flipping to `canceled`. Previously the user was
      // instantly downgraded to FREE on the first failed renewal charge,
      // losing Pro mid-cycle while Stripe was still trying to bill them.
      // Treat those states as Pro-still-active; only `canceled`,
      // `incomplete_expired`, and `paused` actually remove Pro.
      const proStatuses: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due', 'unpaid'];
      const stillPro = (proStatuses as string[]).includes(sub.status);
      // Map Stripe's status onto our enum so the account page reflects reality.
      // past_due/unpaid are TRANSIENT during the dunning window — show PAST_DUE
      // so the user sees there's a billing issue while we still treat them as
      // Pro for plan-gating (handled separately by `stillPro`).
      let subStatus: 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'PAST_DUE';
      if (sub.status === 'active' || sub.status === 'trialing') subStatus = 'ACTIVE';
      else if (sub.status === 'past_due' || sub.status === 'unpaid') subStatus = 'PAST_DUE';
      else subStatus = 'CANCELLED';
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          plan: stillPro ? 'PRO' : 'FREE',
          subscriptionStatus: subStatus,
          subscriptionEndsAt: periodEnd ? new Date(periodEnd * 1000) : null,
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
