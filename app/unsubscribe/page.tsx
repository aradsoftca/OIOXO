'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailX, Check } from 'lucide-react';

export default function UnsubscribePage() {
  return (
    <React.Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-[var(--color-fg-muted)]">Loading…</div>}>
      <Inner />
    </React.Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const submit = React.useCallback(async () => {
    setState('busy');
    try {
      const r = await fetch('/api/unsubscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      setState(r.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }, [email, token]);

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="w-[min(440px,92vw)] border border-black/[0.08] bg-[var(--color-surface-1)] p-7 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center text-white" style={{ background: 'var(--brand-gradient)' }}>
          {state === 'done' ? <Check className="h-6 w-6" /> : <MailX className="h-6 w-6" />}
        </div>
        {state === 'done' ? (
          <>
            <h1 className="text-[20px] font-bold tracking-tight">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              <span className="font-semibold text-[var(--color-fg)]">{email}</span> won&apos;t receive marketing
              emails from us. You&apos;ll still get essential account emails (receipts, password resets).
            </p>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className="text-[20px] font-bold tracking-tight">Link not valid</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              This unsubscribe link is invalid or has expired. Contact{' '}
              <Link href="/support" className="text-[var(--brand-1)] hover:underline">support</Link> and we&apos;ll sort it out.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[20px] font-bold tracking-tight">Unsubscribe from marketing email</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Stop sending marketing email to {email ? <span className="font-semibold text-[var(--color-fg)]">{email}</span> : 'this address'}?
              Essential account emails will still be sent.
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={state === 'busy' || !email || !token}
              className="mt-5 inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
            >
              {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Unsubscribe
            </button>
          </>
        )}
      </div>
    </div>
  );
}
