'use client';

import * as React from 'react';
import Link from 'next/link';
import { Crown, Lock } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getLever, type LeverType } from '@/lib/limits/policy';

function useSessionResolved(): boolean {
  const { status } = useSession();
  return status !== 'loading';
}

/**
 * Inline "Pro" badge. Show NEXT TO a control whose VALUE crosses the free cap
 * for the user — gives the user a free preview of what Pro unlocks before they
 * hit the actual gate at export time.
 *
 *   <ProBadge toolKey="video-studio" lever="output-resolution" value={1080} />
 *
 * Renders nothing when the value is within the free cap (or the user is Pro,
 * if you pass `isPro`).
 */
export function ProBadge({
  toolKey, lever, value, isPro, compact, label,
}: {
  toolKey: string;
  lever: LeverType;
  value: number;
  isPro?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const resolved = useSessionResolved();
  if (!resolved) return null;
  if (isPro) return null;
  const l = getLever(toolKey, lever);
  if (!l) return null;
  if (value <= l.free) return null;
  const text = label ?? 'Pro';
  return (
    <Link
      href="/pricing"
      className={`inline-flex items-center gap-1 rounded font-bold uppercase tracking-wider transition hover:brightness-110 ${
        compact
          ? 'px-1 py-px text-[9px]'
          : 'px-1.5 py-0.5 text-[10px]'
      }`}
      style={{ background: 'var(--brand-gradient)', color: 'white' }}
      title={`Pro unlocks ${l.label.toLowerCase()} up to ${l.pro ?? 'unlimited'}${l.unit ? ' ' + l.unit : ''}`}
    >
      <Crown className={compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
      {text}
    </Link>
  );
}

/**
 * Inline Pro badge for a FORMAT option (the `formats` lever uses a string
 * whitelist, not a number). Shows when the format is NOT in the free list.
 *
 *   <FormatProBadge toolKey="video-convert-format" format="mov" />
 */
export function FormatProBadge({
  toolKey, format, isPro, compact,
}: {
  toolKey: string;
  format: string;
  isPro?: boolean;
  compact?: boolean;
}) {
  const resolved = useSessionResolved();
  if (!resolved) return null;
  if (isPro) return null;
  const l = getLever(toolKey, 'formats');
  if (!l || !l.freeFormats) return null;
  if (l.freeFormats.includes(format.toLowerCase())) return null;
  return (
    <Link
      href="/pricing"
      className={`inline-flex items-center gap-1 rounded font-bold uppercase tracking-wider transition hover:brightness-110 ${
        compact ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
      style={{ background: 'var(--brand-gradient)', color: 'white' }}
      title={`Pro format. Free: ${l.freeFormats.map((f) => f.toUpperCase()).join(', ')}.`}
    >
      <Crown className={compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
      Pro
    </Link>
  );
}

/**
 * Small "max X on free" hint next to a slider/select. Always visible (until
 * Pro), so the user knows the policy in advance.
 */
export function FreeCapHint({ toolKey, lever, isPro }: { toolKey: string; lever: LeverType; isPro?: boolean }) {
  const resolved = useSessionResolved();
  if (!resolved) return null;
  if (isPro) return null;
  const l = getLever(toolKey, lever);
  if (!l) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-[var(--color-fg-subtle)]" title={`Pro: up to ${l.pro ?? 'unlimited'}${l.unit ? ' ' + l.unit : ''}`}>
      <Lock className="h-2.5 w-2.5" />
      free max {l.free}{l.unit ? ' ' + l.unit : ''}
    </span>
  );
}
