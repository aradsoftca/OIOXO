'use client';

import * as React from 'react';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setDone(true);
      else {
        const d = await res.json();
        setError(d?.error || 'Something went wrong.');
      }
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
              <TileIcon name="key-round" size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Account recovery
              </div>
              <div className="text-[20px] font-bold tracking-tight">Reset password</div>
            </div>
          </div>

          {done ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              If an account exists for <span className="font-semibold text-[var(--color-fg)]">{email}</span>,
              a password reset link is on its way. The link expires in 1 hour.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                Enter your email and we&apos;ll send you a link to set a new password.
              </p>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
              {error && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
          <div className="text-center text-[12px] text-[var(--color-fg-muted)]">
            <Link href="/auth/sign-in" className="font-semibold text-[var(--color-cat-image)] hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
