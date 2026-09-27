'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Crown, Gift, Loader2, Lock, X } from 'lucide-react';
import { gateMetaForKey, isGatedKey, maxBytesForKey, formatBytes } from '@/lib/usage/config';
import { benefitsForKey } from '@/lib/usage/benefits';
import { DISPLAY_PRICING } from '@/lib/stripe';
import { armDownloadBypass } from '@/lib/usage/gate-bridge';

type Phase = 'idle' | 'reward' | 'paywall' | 'size' | 'error';

/** File-size context shown in the 'size' phase of the gate. */
export interface SizeContext { bytes: number; cap: number }

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
 *
 * `key` is the gate key: usually a Category, but it can be a per-tool id for the
 * surgical studio cases (e.g. 'studio-invoice'). The modal still renders using
 * the key's display category.
 */
// When /api/usage is briefly unreachable (a transient network blip, a flaky
// connection, an ad-blocker that intermittently trips), hard-blocking a FREE
// user mid-task is hostile — they did nothing wrong and lose their work-in-flight.
// But always failing OPEN would let someone farm unlimited use by blocking the
// endpoint. The balance: grant a small number of consecutive GRACE uses on
// transient failure, then fall closed. A single successful check resets the
// counter, so only sustained evasion ever hits the wall. Persisted across
// reloads so the grace budget can't be reset by refreshing.
const GRACE_KEY = 'xv:usage-grace-fails';
const MAX_GRACE = 2;
function readGraceFails(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(GRACE_KEY) || '0', 10) || 0); }
  catch { return 0; }
}
function bumpGraceFails(): number {
  const n = readGraceFails() + 1;
  try { localStorage.setItem(GRACE_KEY, String(n)); } catch { /* ignore */ }
  return n;
}
function resetGraceFails(): void {
  try { localStorage.removeItem(GRACE_KEY); } catch { /* ignore */ }
}

export function useUsageGate(key: string) {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [claiming, setClaiming] = React.useState(false);
  const [sizeCtx, setSizeCtx] = React.useState<SizeContext | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards claim() against double-fire: setState updaters can run twice
  // (React StrictMode in dev, or a re-render racing the tick), which would
  // double-POST /api/usage/reward and burn TWO uses on one countdown.
  const claimFired = React.useRef(false);
  // Flipped when the user cancels mid-countdown. claim() reads this AFTER
  // its server call resolves and skips consuming a use that nobody is
  // waiting for.
  const cancelled = React.useRef(false);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const settle = React.useCallback((ok: boolean) => {
    clearTimer();
    setPhase('idle');
    setClaiming(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(ok);
  }, []);

  const cancel = React.useCallback(() => {
    cancelled.current = true;
    settle(false);
  }, [settle]);

  React.useEffect(() => clearTimer, []);

  const claim = React.useCallback(async () => {
    if (claimFired.current) return;
    claimFired.current = true;
    setClaiming(true);
    let done: { success: boolean; secondsRemaining: number };
    try {
      done = await postJson<{ success: boolean; secondsRemaining: number }>(
        '/api/usage/reward',
        { category: key, action: 'complete' },
      );
    } catch {
      // Reward complete failed — let the user retry by resetting state.
      claimFired.current = false;
      setClaiming(false);
      return;
    }
    if (!done.success) {
      setSeconds(done.secondsRemaining || 1);
      setClaiming(false);
      claimFired.current = false;
      return;
    }
    // If the user cancelled while the reward request was in flight, don't
    // consume a use — the caller has already received false.
    if (cancelled.current) return;
    let consumed: UsageResponse;
    try {
      consumed = await postJson<UsageResponse>('/api/usage', {
        category: key,
        action: 'consume',
      });
    } catch {
      settle(false);
      return;
    }
    if (cancelled.current) return;
    if (consumed.allowed) armDownloadBypass();
    settle(consumed.allowed);
  }, [key, settle]);

  const startCountdown = React.useCallback(
    (from: number) => {
      setSeconds(from);
      clearTimer();
      claimFired.current = false;
      cancelled.current = false;
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearTimer();
            // Schedule outside the updater so React can't double-invoke us.
            queueMicrotask(() => { void claim(); });
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    },
    [claim],
  );

  const guard = React.useCallback(async (opts?: { bytes?: number }): Promise<boolean> => {
    if (!isGatedKey(key)) return true;
    // If a previous gate is still open (double-click on Run, or two gated
    // controls fired together), resolve the stale one as false so the first
    // caller's promise doesn't hang forever, then take over the modal.
    if (resolver.current) {
      const prior = resolver.current;
      resolver.current = null;
      clearTimer();
      prior(false);
    }
    // SIZE gate (free tier only) — runs before the count gate. A file over the
    // free cap shows a polite upgrade prompt; no 30s reward (a bigger file can't
    // be earned by waiting). Pro has no size cap, so it falls straight through.
    if (opts?.bytes != null) {
      const cap = maxBytesForKey(key);
      if (Number.isFinite(cap) && opts.bytes > cap) {
        let free = true;
        try { const { isWatermarkOn } = await import('@/lib/watermark/config'); free = await isWatermarkOn(); }
        catch { /* unknown → treat as free, surface the gate */ }
        if (free) {
          setSizeCtx({ bytes: opts.bytes, cap });
          return new Promise<boolean>((resolve) => { resolver.current = resolve; setPhase('size'); });
        }
      }
    }
    let r: UsageResponse;
    try {
      r = await postJson<UsageResponse>('/api/usage', { category: key, action: 'consume' });
    } catch {
      // Pro fails OPEN (cached entitlement). Free gets a small GRACE budget so a
      // transient blip / intermittent ad-blocker doesn't brick a user mid-task —
      // then falls closed so the endpoint can't be blocked to farm unlimited use.
      let pro = false;
      try { const { isWatermarkOn } = await import('@/lib/watermark/config'); pro = !(await isWatermarkOn()); }
      catch { /* unknown → treat as free */ }
      if (pro) return true;
      const fails = bumpGraceFails();
      if (fails <= MAX_GRACE) {
        // Let this one through; the next successful check resets the budget.
        armDownloadBypass();
        return true;
      }
      // Repeated failures = sustained evasion or a real outage — surface the
      // gate (and tell the user what happened; ad-blockers blocking /api/usage
      // land here too) instead of silently granting forever.
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPhase('error');
      });
    }
    // A successful check means the endpoint is reachable again — clear any grace
    // debt so a future transient blip gets the full budget again.
    resetGraceFails();
    if (r.allowed) { armDownloadBypass(); return true; }
    if (r.gate === 'rewarded') {
      await postJson('/api/usage/reward', { category: key, action: 'start' });
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
  }, [key, startCountdown]);

  const gate =
    phase === 'idle' ? null : (
      <GateModal
        phase={phase}
        seconds={seconds}
        claiming={claiming}
        category={key}
        sizeCtx={sizeCtx}
        onCancel={cancel}
      />
    );

  return { guard, gate };
}

export function GateModal({
  phase,
  seconds,
  claiming,
  category,
  sizeCtx,
  onCancel,
}: {
  phase: Phase;
  seconds: number;
  claiming: boolean;
  /** The gate KEY — a Category, a per-tool studio id, or an app key (send/call/watch). */
  category: string;
  sizeCtx?: SizeContext | null;
  onCancel: () => void;
}) {
  const meta = gateMetaForKey(category);
  const color = `var(${meta.colorVar})`;
  const benefits = benefitsForKey(category);
  const priceLine = `$${DISPLAY_PRICING.monthly}/mo · cancel anytime`;
  const Benefits = () => (
    <ul className="mt-4 space-y-1.5 border-t border-black/[0.06] pt-4">
      <li className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">With Pro you get</li>
      {benefits.map((b) => (
        <li key={b} className="flex items-start gap-2 text-[12.5px] text-[var(--color-fg)]">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} /> {b}
        </li>
      ))}
    </ul>
  );
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
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              {meta.name}
            </div>
            <h2 className="text-[19px] font-semibold tracking-tight text-[var(--color-fg)]">
              {phase === 'reward' ? 'One more, on us' : phase === 'size' ? 'File over the free size limit' : phase === 'error' ? "Couldn't check your free quota" : 'Daily free limit reached'}
            </h2>
          </div>
        </div>

        {phase === 'error' ? (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              The free-quota check didn&apos;t go through — this is usually a network hiccup,
              or an ad-blocker blocking the request. Allow this site (or pause the blocker)
              and try again. Pro skips quota checks entirely.
            </p>
            <Benefits />
            <Link
              href="/pricing"
              className="mt-4 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Go Pro — no quota checks
            </Link>
            <p className="mt-2 text-center text-[11px] text-[var(--color-fg-subtle)]">{priceLine}</p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 w-full py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Close and try again
            </button>
          </div>
        ) : phase === 'size' ? (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              This file is {sizeCtx ? <strong className="text-[var(--color-fg)]">{formatBytes(sizeCtx.bytes)}</strong> : 'larger than'}, but
              the free tier handles {meta.name.toLowerCase()} files up to{' '}
              <strong className="text-[var(--color-fg)]">{formatBytes(sizeCtx?.cap ?? 0)}</strong>. Go Pro to
              process files of any size — or try a smaller file.
            </p>
            <Benefits />
            <Link
              href="/pricing"
              className="mt-4 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Upgrade for larger files
            </Link>
            <p className="mt-2 text-center text-[11px] text-[var(--color-fg-subtle)]">{priceLine}</p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 w-full py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Use a smaller file instead
            </button>
          </div>
        ) : phase === 'reward' ? (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              You&apos;ve used your free {meta.name.toLowerCase()} action for today. Wait a few
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
            <Benefits />
            <Link
              href="/pricing"
              className="mt-4 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Skip the wait — go Pro
            </Link>
            <p className="mt-2 text-center text-[11px] text-[var(--color-fg-subtle)]">{priceLine}</p>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              You&apos;ve used today&apos;s free {meta.name.toLowerCase()} exports. Your limit resets at
              midnight UTC — or go Pro for unlimited use across every tool, no waits.
            </p>
            <Benefits />
            <Link
              href="/pricing"
              className="mt-4 flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: color }}
            >
              <Crown className="h-3.5 w-3.5" /> Upgrade to Pro
            </Link>
            <p className="mt-2 text-center text-[11px] text-[var(--color-fg-subtle)]">{priceLine}</p>
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
