'use client';

import * as React from 'react';
import Link from 'next/link';
import { Crown, Gift, Loader2, Lock, X } from 'lucide-react';
import type { Category } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { isGated } from '@/lib/usage/config';

type Phase = 'idle' | 'reward' | 'paywall';

interface UsageResponse {
  gate: 'free' | 'rewarded' | 'paywall';
  allowed: boolean;
  used?: number;
  limit?: number;
  rewardWaitSeconds?: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

/**
 * Gate a tool's "run/export" action behind the freemium quota.
 *
 * Usage in a tool:
 *   const { guard, gate } = useUsageGate('image');
 *   const onRun = async () => { if (!(await guard())) return; ...do work... };
 *   return <>{...ui...}{gate}</>;
 *
 * `guard()` resolves true when the user may proceed (free use consumed, or the
 * 30s reward was earned). It resolves false when they cancel or hit the paywall.
 * Ungated categories resolve true instantly without a network call.
 */
export function useUsageGate(category: Category) {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [claiming, setClaiming] = React.useState(false);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const settle = React.useCallback((ok: boolean) => {
    clearTimer();
    setPhase('idle');
    setClaiming(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  React.useEffect(() => clearTimer, []);

  const claim = React.useCallback(async () => {
    setClaiming(true);
    const done = await postJson<{ success: boolean; secondsRemaining: number }>(
      '/api/usage/reward',
      { category, action: 'complete' },
    );
    if (!done.success) {
      setSeconds(done.secondsRemaining || 1);
      setClaiming(false);
      return;
    }
    // Reward earned — now actually consume the rewarded use.
    const consumed = await postJson<UsageResponse>('/api/usage', {
      category,
      action: 'consume',
    });
    settle(consumed.allowed);
  }, [category, settle]);

  const startCountdown = React.useCallback(
    (from: number) => {
      setSeconds(from);
      clearTimer();
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearTimer();
            void claim();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    },
    [claim],
  );

  const guard = React.useCallback(async (): Promise<boolean> => {
    if (!isGated(category)) return true;
    const r = await postJson<UsageResponse>('/api/usage', { category, action: 'consume' });
    if (r.allowed) return true;
    if (r.gate === 'rewarded') {
      await postJson('/api/usage/reward', { category, action: 'start' });
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPhase('reward');
        startCountdown(r.rewardWaitSeconds || 30);
      });
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPhase('paywall');
    });
  }, [category, startCountdown]);

  const gate =
    phase === 'idle' ? null : (
      <GateModal
        phase={phase}
        seconds={seconds}
        claiming={claiming}
        category={category}
        onCancel={() => settle(false)}
      />
    );

  return { guard, gate };
}

function GateModal({
  phase,
  seconds,
  claiming,
  category,
  onCancel,
}: {
  phase: Phase;
  seconds: number;
  claiming: boolean;
  category: Category;
  onCancel: () => void;
}) {
  const cat = CATEGORIES[category];
  const color = `var(${cat.colorVar})`;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md border border-white/10 bg-[var(--color-surface-1)] shadow-2xl">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 px-6 pt-6">
          <div className="grid h-11 w-11 place-items-center text-white" style={{ background: color }}>
            {phase === 'reward' ? <Gift className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              {cat.name}
            </div>
            <h2 className="text-[19px] font-semibold tracking-tight text-[var(--color-fg)]">
              {phase === 'reward' ? 'One more, on us' : 'Daily free limit reached'}
            </h2>
          </div>
        </div>

        {phase === 'reward' ? (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              You&apos;ve used your free {cat.name.toLowerCase()} action for today. Wait a few
              seconds for one more — or skip the wait and unlock unlimited use.
            </p>
            <div className="my-5 flex flex-col items-center gap-2">
              <div className="text-[44px] font-bold tabular-nums tracking-tight" style={{ color }}>
                {claiming ? <Loader2 className="h-10 w-10 animate-spin" /> : `${seconds}s`}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                {claiming ? 'Unlocking…' : 'until your free action'}
              </div>
            </div>
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Skip the wait — go Pro
            </Link>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              You&apos;ve reached today&apos;s free {cat.name.toLowerCase()} actions. Upgrade to Pro
              for unlimited use across every tool — one account unlocks the whole platform.
            </p>
            <Link
              href="/pricing"
              className="mt-5 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Upgrade to Pro
            </Link>
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 w-full py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
