'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';
import { Loader2, ExternalLink, LogOut } from 'lucide-react';

export function ManageBillingButton() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const open = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Could not open billing portal.');
    } catch {
      setError('Could not open billing portal.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="flex items-center gap-2 border border-black/[0.12] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
        Manage billing
      </button>
      {error && <div className="mt-2 text-[12px] text-[var(--color-cat-pdf)]">{error}</div>}
    </div>
  );
}

export function CancelSubscription({ cancelAtPeriodEnd, endsAt }: { cancelAtPeriodEnd: boolean; endsAt: string | null }) {
  const [canceling, setCanceling] = React.useState(cancelAtPeriodEnd);
  const [ends, setEnds] = React.useState(endsAt);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const act = async (resume: boolean) => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resume }),
      });
      const d = await res.json();
      if (d.ok) { setCanceling(d.cancelAtPeriodEnd); if (d.endsAt) setEnds(d.endsAt); }
      else setError(d.error || 'Could not update the subscription.');
    } catch { setError('Could not update the subscription.'); } finally { setLoading(false); }
  };

  const dateStr = ends ? new Date(ends).toLocaleDateString() : null;

  return (
    <div className="mt-3 space-y-2">
      {canceling ? (
        <>
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            Your plan won&apos;t renew — you keep Pro {dateStr ? `until ${dateStr}` : 'until the end of the current period'}, with no further charge.
          </p>
          <button type="button" onClick={() => act(true)} disabled={loading}
            className="flex items-center gap-2 bg-[var(--color-cat-finance)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-60">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Resume subscription
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => act(false)} disabled={loading}
            className="flex items-center gap-2 border border-black/[0.12] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Cancel subscription
          </button>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">
            You&apos;ll keep Pro until the end of your current billing period — no further charge.
          </p>
        </>
      )}
      {error && <div className="text-[12px] text-[var(--color-cat-pdf)]">{error}</div>}
    </div>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/auth/sign-in' })}
      className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
