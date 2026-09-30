'use client';

import * as React from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Loader2, Trash2 } from 'lucide-react';

export function DeleteAccountPanel({ email }: { email: string | null }) {
  const [step, setStep] = React.useState<'idle' | 'confirm' | 'done'>('idle');
  const [typed, setTyped] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const remove = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not delete your account. Please try again or email us.');
        return;
      }
      setStep('done');
      await signOut({ callbackUrl: '/' });
    } catch {
      setError('Could not delete your account. Please try again or email us.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return <p className="font-semibold text-[var(--color-fg)]">Your account has been deleted.</p>;
  }

  return (
    <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-6 space-y-4">
      <p className="text-[13px]">
        Signed in as <strong>{email ?? 'your account'}</strong>.
      </p>
      {step === 'idle' ? (
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="flex items-center gap-2 bg-red-600 px-5 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:bg-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete my account
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--color-fg)]">
            This permanently deletes your account, sign-in connections, API keys, usage counts and support
            messages, and signs you out. It cannot be undone. Invoice and payment records are kept as tax law
            requires. If you have an active Pro subscription, cancel it first on your account page so you are not
            charged again.
          </p>
          <label className="block text-[12px] font-semibold">
            Type DELETE to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="mt-1 block w-full border border-black/[0.15] bg-transparent px-3 py-2 text-[13px]"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={remove}
              disabled={loading || typed !== 'DELETE'}
              className="flex items-center gap-2 bg-red-600 px-5 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Permanently delete
            </button>
            <button
              type="button"
              onClick={() => { setStep('idle'); setTyped(''); setError(''); }}
              disabled={loading}
              className="border border-black/[0.12] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
          {error && <div className="text-[12px] text-[var(--color-cat-pdf)]">{error}</div>}
        </div>
      )}
    </div>
  );
}

export function SignInToDelete() {
  return (
    <p>
      <Link className="font-semibold text-[var(--brand-1)] hover:underline" href="/auth/sign-in?callbackUrl=/delete-account">
        Sign in to delete your account
      </Link>{' '}
      — you can delete it right here, in the website or the app.
    </p>
  );
}
