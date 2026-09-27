import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Crown, Receipt } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ManageBillingButton, CancelSubscription, SignOutButton } from '@/components/account/AccountActions';
import { getStripe } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Account' };

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/account');

  const uid = (session.user as { id?: string }).id;
  const user = uid
    ? await prisma.user.findUnique({
        where: { id: uid },
        select: { email: true, name: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true, stripeCustomerId: true, stripeSubscriptionId: true, createdAt: true },
      })
    : null;
  if (!user) redirect('/auth/sign-in?callbackUrl=/account');

  // Apply the same fail-safe as the API gates (Pass 73) + the session
  // callback (Pass 95) so a past-period user sees "Upgrade" instead of the
  // Pro-management UI if Stripe's deletion webhook missed.
  const expiredPlan = user.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now();
  const isPro = !expiredPlan && (user.plan === 'PRO' || user.plan === 'BUSINESS');

  // Live cancellation state from Stripe (so we can show "won't renew — Pro until X"
  // + a Cancel/Resume control). Cancellation is at period end, enforced via
  // /api/stripe/cancel. Best-effort: falls back to stored data if Stripe is unreachable.
  // Run Stripe + DB queries in parallel + race the Stripe call against a 4s
  // timeout — otherwise a slow/down Stripe blocks the entire account page
  // render until next.js' default request timeout. The catch already handles
  // the timeout-as-fallback case (line below).
  let cancelAtPeriodEnd = false;
  let subEndsAt: string | null = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toISOString() : null;

  const stripeSubP: Promise<{ cancel_at_period_end?: boolean; pe?: number } | null> = (isPro && user.stripeSubscriptionId)
    ? (async () => {
        try {
          const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('stripe-timeout')), 4000));
          const sub = await Promise.race([getStripe().subscriptions.retrieve(user.stripeSubscriptionId!), timeoutP]);
          const pe = (sub as unknown as { current_period_end?: number }).current_period_end
            ?? (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
          return { cancel_at_period_end: sub.cancel_at_period_end ?? false, pe };
        } catch { return null; }
      })()
    : Promise.resolve(null);

  const [payments, cryptos, stripeSub] = await Promise.all([
    prisma.payment.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, currency: true, status: true, plan: true, createdAt: true, invoiceUrl: true, receiptUrl: true },
    }),
    prisma.cryptoPayment.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, currency: true, status: true, planType: true, createdAt: true },
    }),
    stripeSubP,
  ]);

  if (stripeSub) {
    cancelAtPeriodEnd = stripeSub.cancel_at_period_end ?? false;
    if (stripeSub.pe) subEndsAt = new Date(stripeSub.pe * 1000).toISOString();
  }

  const history = [
    ...payments.map((p) => ({ id: p.id, date: p.createdAt, amount: p.amount, currency: p.currency, status: p.status as string, label: `${p.plan} · card`, link: p.receiptUrl || p.invoiceUrl || null })),
    ...cryptos.map((c) => ({ id: c.id, date: c.createdAt, amount: c.amount, currency: c.currency, status: c.status, label: `${c.planType} · crypto`, link: null as string | null })),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-extrabold tracking-tight">Account</h1>
        <SignOutButton />
      </div>

      {/* Profile */}
      <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-6 space-y-4">
        <Row label="Email" value={user.email ?? '—'} />
        {user.name && <Row label="Name" value={user.name} />}
        <Row label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
      </div>

      {/* Subscription */}
      <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Plan</span>
          <span className={isPro ? 'flex items-center gap-1.5 bg-[var(--color-cat-finance)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white' : 'text-[13px] font-semibold'}>
            {isPro && <Crown className="h-3 w-3" />}{user.plan}
          </span>
        </div>
        {isPro && <Row label="Status" value={(user.subscriptionStatus || 'ACTIVE').toLowerCase()} />}
        {isPro && subEndsAt && (
          <Row label={cancelAtPeriodEnd ? 'Pro until' : 'Renews'} value={new Date(subEndsAt).toLocaleDateString()} />
        )}

        <div className="border-t border-black/[0.06] pt-4">
          {isPro ? (
            user.stripeCustomerId ? (
              <>
                <ManageBillingButton />
                {user.stripeSubscriptionId && (
                  <CancelSubscription cancelAtPeriodEnd={cancelAtPeriodEnd} endsAt={subEndsAt} />
                )}
              </>
            ) : (
              <p className="text-[13px] text-[var(--color-fg-muted)]">
                Your Pro plan was activated via crypto. To renew, return to{' '}
                <Link href="/pricing" className="underline">pricing</Link> before it ends.
              </p>
            )
          ) : (
            <Link href="/pricing" className="inline-flex items-center gap-2 bg-[var(--color-cat-finance)] px-5 py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Crown className="h-3.5 w-3.5" /> Upgrade to Pro
            </Link>
          )}
        </div>
      </div>

      {/* Billing history */}
      <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-6">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Billing history</span>
        </div>
        {history.length === 0 ? (
          <p className="text-[13px] text-[var(--color-fg-muted)]">No payments yet.</p>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--color-fg)]">{money(h.amount, h.currency)}</div>
                  <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{new Date(h.date).toLocaleDateString()} · {h.label}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${/succeed|complete|paid|active/i.test(h.status) ? 'text-green-600' : 'text-[var(--color-fg-subtle)]'}`}>{h.status}</span>
                  {h.link && <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--brand-1)] hover:underline">Receipt</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-[12px] text-[var(--color-fg-muted)]">
        Need a hand? <Link href="/help" className="text-[var(--brand-1)] hover:underline">Help center</Link> · <Link href="/support" className="text-[var(--brand-1)] hover:underline">Support</Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</span>
      <span className="text-[13px] font-semibold">{value}</span>
    </div>
  );
}
