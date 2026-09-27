'use client';

import * as React from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TileIcon } from '@/components/tiles/TileIcon';

export default function SignInPage() {
  return (
    <React.Suspense fallback={<div className="grid min-h-[70vh] place-items-center text-[var(--color-fg-muted)]">Loading…</div>}>
      <SignInInner />
    </React.Suspense>
  );
}

const NOTICES: Record<string, string> = {
  verified: 'Email verified — you can sign in now.',
  reset: 'Password updated — sign in with your new password.',
};
const ERRORS: Record<string, string> = {
  missing_token: 'That verification link was incomplete. Try registering again.',
  invalid_token: 'That verification link is invalid or already used.',
  expired_token: 'That verification link expired. Register again to get a new one.',
};

// Open-redirect guard: only accept callback URLs that point back at our own
// site. Without this, `/auth/sign-in?callbackUrl=https://evil.com` redirects
// the user off-site after a successful sign-in (classic phishing chain).
function safeCallback(raw: string | null): string {
  if (!raw) return '/';
  // Same-origin relative paths only. A leading "//" is a protocol-relative
  // URL that browsers treat as cross-origin — reject those too.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get('callbackUrl'));
  const notice = NOTICES[params.get('verified') ? 'verified' : params.get('reset') ? 'reset' : ''];
  const urlError = ERRORS[params.get('error') ?? ''];
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setSubmitting(false);
    if (res?.error) setError('Invalid email or password.');
    else router.push(callbackUrl);
  }

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="tile-surface w-[min(420px,92vw)]" data-neutral="true">
        <div className="tile-content gap-5 !justify-start">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-image)] text-white">
              <TileIcon name="log-in" size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Welcome back
              </div>
              <div className="text-[20px] font-bold tracking-tight">Sign in</div>
            </div>
          </div>

          {notice && (
            <div className="border border-[var(--color-cat-image)]/30 bg-[var(--color-cat-image)]/10 px-3 py-2 text-[12px] font-medium text-[var(--color-fg)]">
              {notice}
            </div>
          )}
          {urlError && (
            <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{urlError}</div>
          )}

          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl })}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.12] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1f2328] transition hover:bg-black/[0.03]"
          >
            <GoogleGlyph /> Continue with Google
          </button>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            <span className="h-px flex-1 bg-black/10" /> or <span className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={submit} className="space-y-3">
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
              placeholder="Password"
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="flex items-center justify-between text-[12px] text-[var(--color-fg-muted)]">
            <Link href="/auth/forgot-password" className="hover:text-[var(--color-fg)] hover:underline">
              Forgot password?
            </Link>
            <Link href="/auth/sign-up" className="font-semibold text-[var(--color-cat-image)] hover:underline">
              Create account
            </Link>
          </div>
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
