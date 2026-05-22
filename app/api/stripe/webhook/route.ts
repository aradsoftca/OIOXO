import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature');
  if (!sig) return new NextResponse('missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '');
  } catch (err) {
    return new NextResponse(`bad signature: ${(err as Error).message}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.customer && cs.subscription && cs.customer_email) {
        await prisma.user.update({
          where: { email: cs.customer_email },
          data: {
            plan: 'PRO',
            stripeCustomerId: typeof cs.customer === 'string' ? cs.customer : cs.customer.id,
            stripeSubscriptionId:
              typeof cs.subscription === 'string' ? cs.subscription : cs.subscription.id,
          },
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { plan: 'FREE', stripeSubscriptionId: null },
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
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          plan: sub.status === 'active' || sub.status === 'trialing' ? 'PRO' : 'FREE',
          subscriptionEndsAt: periodEnd ? new Date(periodEnd * 1000) : null,
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
