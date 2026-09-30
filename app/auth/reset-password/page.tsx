'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TileIcon } from '@/components/tiles/TileIcon';

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="grid min-h-[70vh] place-items-center text-[var(--color-fg-muted)]">Loading…</div>}>
      <ResetInner />
    </React.Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error || 'Could not reset password.');
      else router.push('/auth/sign-in?reset=1');
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="tile-surface w-[min(420px,92vw)]" data-neutral="true">
        <div className="tile-content gap-5 !justify-start">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-image)] text-white">
              <TileIcon name="lock" size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Account recovery
              </div>
              <div className="text-[20px] font-bold tracking-tight">Set new password</div>
            </div>
          </div>

          {!token ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              This reset link is missing its token. Request a new one from{' '}
              <Link href="/auth/forgot-password" className="font-semibold text-[var(--color-cat-image)] hover:underline">
                forgot password
              </Link>.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[16px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[16px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
              {error && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
