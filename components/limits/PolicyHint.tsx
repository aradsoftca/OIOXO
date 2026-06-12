'use client';

import * as React from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getPolicy } from '@/lib/limits/policy';
import { limitForKey, isGatedKey } from '@/lib/usage/config';
import { useIsPro } from '@/lib/limits/use-is-pro';

/**
 * Small "Free plan: …" banner shown above a tool. Reads the policy and lists
 * the active levers in plain text so users know what to expect before they
 * hit the gate. Falls back to `fallbackKey` (typically the tool's category)
 * when the tool itself has no bespoke policy.
 *
 * Hidden during session resolution to avoid a one-frame "Free plan" flash on
 * Pro users (their session resolves only after hydration).
 */
export function PolicyHint({ toolKey, fallbackKey, compact }: { toolKey: string; fallbackKey?: string; compact?: boolean }) {
  const { status } = useSession();
  const isPro = useIsPro();
  const policy = getPolicy(toolKey) ?? (fallbackKey ? getPolicy(fallbackKey) : undefined);
  if (status === 'loading') return null;
  if (!policy || isPro) return null;
  const items: string[] = [];
  // COUNT comes from config.ts (the runtime authority), NOT policy.count-day
  // (which is never enforced). Show the real per-key daily cap; 9999+ = no limit.
  const countKey = isGatedKey(toolKey) ? toolKey : (fallbackKey && isGatedKey(fallbackKey) ? fallbackKey : null);
  if (countKey) {
    const n = limitForKey(countKey);
    if (Number.isFinite(n) && n < 9999) items.push(`${n}/day`);
  }
  for (const l of policy.levers) {
    switch (l.type) {
      case 'count-day': break; // dead lever — count is shown from config above
      case 'input-size': items.push(`${(l.free / (1024 * 1024)).toFixed(0)} MB max`); break;
      case 'input-duration': items.push(`${l.free}${l.unit ?? ''} max`); break;
      case 'output-resolution': items.push(`${l.free}p max`); break;
      case 'pages': items.push(`${l.free} ${l.unit ?? 'pages'} max`); break;
      case 'tracks': items.push(`${l.free} ${l.unit ?? 'tracks'}`); break;
      case 'layers': items.push(`${l.free} layers`); break;
      case 'batch': items.push(`${l.free} files/batch`); break;
      case 'participants': items.push(`${l.free} people`); break;
      case 'session-minutes': items.push(`${l.free} min sessions`); break;
      case 'recording-minutes': items.push(`${l.free} min recording`); break;
      case 'ai-minutes-day': items.push(`${l.free} AI min/day`); break;
      case 'formats': items.push(`${l.freeFormats?.length ?? 0} free formats`); break;
    }
  }
  return (
    <div className={`flex items-center gap-2 border border-black/[0.06] bg-black/[0.02] px-3 ${compact ? 'py-1' : 'py-1.5'} text-[11px] text-[var(--color-fg-muted)]`}>
      <span className="text-[var(--color-fg-subtle)]">Free plan limits:</span>
      <span>{items.join(' · ')}</span>
      <Link href="/pricing" className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: 'var(--brand-gradient)' }}>
        <Crown className="h-2.5 w-2.5" /> Upgrade
      </Link>
    </div>
  );
}
