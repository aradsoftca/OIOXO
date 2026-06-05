'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clock, Crown, X } from 'lucide-react';
import { CodeMeter, formatRemaining as fmt } from '@/lib/oioxo/usage-client';

// Re-export so existing imports keep working; the logic now lives in the shared,
// host-independent usage-client (the SAME one the desktop IDE uses).
export const formatRemaining = fmt;

/**
 * OIOXO coding agent — client-side TIME meter (pairs with /api/usage/code).
 *
 *   const { begin, end, remaining, gate } = useCodeMeter();
 *   const onRun = async () => {
 *     if (!(await begin())) return;   // blocked → paywall shown
 *     try { ...run the agent... } finally { await end(); }  // reports elapsed time
 *   };
 *   return <>{ui}{gate}</>;
 *
 * Every model is accessible (hardware-gated); the meter only limits free AI *time*
 * per day. Activated accounts are unlimited (server-side). The client soft-blocks
 * from `remaining`; the server is the hard boundary.
 */
export function useCodeMeter() {
  const [blocked, setBlocked] = React.useState(false);
  /** Remaining free seconds today; null = unlimited (activated account). */
  const [remaining, setRemaining] = React.useState<number | null>(null);
  // One shared meter (web = relative endpoint + cookie identity). The desktop IDE
  // builds the SAME CodeMeter with the oioxo.com URL + a keychain bearer token.
  const meter = React.useRef(new CodeMeter()).current;

  const begin = React.useCallback(async (): Promise<boolean> => {
    const r = await meter.start();
    setRemaining(r.unlimited ? null : (r.remainingSeconds ?? null));
    if (!r.allowed) { setBlocked(true); return false; }
    return true;
  }, [meter]);

  const end = React.useCallback(async (): Promise<void> => {
    const r = await meter.stop();
    if (r) setRemaining(r.unlimited ? null : (r.remainingSeconds ?? null));
  }, [meter]);

  const gate = blocked ? <CodePaywall onClose={() => setBlocked(false)} /> : null;
  return { begin, end, remaining, gate };
}

function CodePaywall({ onClose }: { onClose: () => void }) {
  const gold = '#E2B24A';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md border border-white/10 bg-[var(--color-surface-1)] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3 px-6 pt-6">
          <div className="grid h-11 w-11 place-items-center text-[#1A181C]" style={{ background: gold }}>
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              On-device AI
            </div>
            <h2 className="text-[19px] font-semibold tracking-tight text-[var(--color-fg)]">
              Daily free AI time used up
            </h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            The editor and your on-device model stay free. You&apos;ve used today&apos;s free AI
            time — activate your account for <strong>unlimited</strong> use. It still runs entirely
            on your machine; activating just lifts the time limit.
          </p>
          <Link
            href="/pricing"
            className="mt-5 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-[#1A181C] transition hover:brightness-105"
            style={{ background: gold }}
          >
            <Crown className="h-3.5 w-3.5" /> Activate account
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
