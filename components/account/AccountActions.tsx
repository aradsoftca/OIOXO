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

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/' })}
      className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
