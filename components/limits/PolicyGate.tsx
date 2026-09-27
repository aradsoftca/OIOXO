'use client';

import * as React from 'react';
import Link from 'next/link';
import { Crown, X, Check, Lock } from 'lucide-react';
import { DISPLAY_PRICING } from '@/lib/stripe';
import { type LimitHit } from '@/lib/limits/policy';

interface Props {
  hit: LimitHit | null;
  onClose: () => void;
}

/**
 * Friendly paywall that names the EXACT lever that was crossed and lists what
 * Pro unlocks for THIS tool — not a generic "go Pro" wall. The user sees
 * precisely why they're being asked to upgrade, which converts much better
 * than a generic upsell.
 */
export function PolicyGate({ hit, onClose }: Props) {
  if (!hit) return null;
  // Defensive: a caller may fire a LimitHit without a fully-populated policy
  // (e.g. an ad-hoc / unknown lever). Never let the paywall itself crash the
  // host tool — fall back to safe copy instead of reading undefined.policy.
  const policy = hit.policy ?? ({} as LimitHit['policy']);
  const title = policy.displayName ?? 'Pro unlocks this';
  const valueProps = Array.isArray(policy.proValueProp) ? policy.proValueProp : [];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-[var(--color-surface-1)] shadow-2xl">
        <div className="relative p-5" style={{ background: 'var(--brand-gradient)' }}>
          <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-white">
            <Crown className="h-5 w-5" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Pro unlocks this</span>
          </div>
          <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-[12px] text-white/90">{hit.friendly}</p>
        </div>

        <div className="space-y-3 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">What Pro unlocks here</div>
          <ul className="space-y-1.5">
            {valueProps.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{v}</span>
              </li>
            ))}
          </ul>

          <div className="rounded border border-black/[0.06] bg-black/[0.03] p-3 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Pro</span>
              <span className="font-mono">
                ${DISPLAY_PRICING.monthly}/mo · ${DISPLAY_PRICING.yearly}/yr
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              One account · every tool, app and studio · cancel anytime.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded border border-black/[0.08] bg-black/[0.04] px-3 py-2 text-[12px] font-semibold transition hover:bg-black/[0.08]"
            >
              Stay on Free
            </button>
            <Link
              href="/pricing"
              className="flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: 'var(--brand-gradient)' }}
            >
              <Crown className="h-3.5 w-3.5" /> Go Pro
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper hook: keeps the most-recent `LimitHit` and a setter to clear it. */
export function usePolicyGate() {
  const [hit, setHit] = React.useState<LimitHit | null>(null);
  return {
    hit,
    fire: (h: LimitHit | null) => { if (h) setHit(h); },
    close: () => setHit(null),
    /** Render the gate. */
    element: <PolicyGate hit={hit} onClose={() => setHit(null)} />,
  };
}
