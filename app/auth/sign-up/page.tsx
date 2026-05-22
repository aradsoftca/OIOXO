'use client';

import * as React from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { TileIcon } from '@/components/tiles/TileIcon';

export default function SignUpPage() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error || 'Could not create your account.');
      else setDone(true);
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
              <TileIcon name="user-plus" size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Get started
              </div>
              <div className="text-[20px] font-bold tracking-tight">Create account</div>
            </div>
          </div>

          {done ? (
            <div className="space-y-3">
              <div className="text-[14px] font-semibold text-[var(--color-fg)]">Check your email</div>
              <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                If that email is available, we sent a verification link. Click it to activate your
                account, then sign in.
              </p>
              <Link
                href="/auth/sign-in"
                className="inline-block bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.12] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1f2328] transition hover:bg-black/[0.03]"
              >
                <GoogleGlyph /> Continue with Google
              </button>
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                <span className="h-px flex-1 bg-black/10" /> or <span className="h-px flex-1 bg-black/10" />
              </div>
              <form onSubmit={submit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
                />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none"
                />
                {error && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create account'}
                </button>
              </form>
              <div className="text-center text-[12px] text-[var(--color-fg-muted)]">
                Already have an account?{' '}
                <Link href="/auth/sign-in" className="font-semibold text-[var(--color-cat-image)] hover:underline">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.7 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.7-9.9 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 19.4l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1C9.9 27 9.5 25.5 9.5 24s.4-3 .9-4.6z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.3-5.7c-2 1.4-4.7 2.3-8.3 2.3-6.4 0-11.8-4.2-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
