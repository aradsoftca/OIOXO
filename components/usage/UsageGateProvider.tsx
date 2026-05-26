'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import type { Category } from '@/lib/registry/types';
import { getTool } from '@/lib/registry';
import { isGated } from '@/lib/usage/config';
import { consumeDownloadBypass } from '@/lib/usage/gate-bridge';
import { GateModal } from './use-usage-gate';

/**
 * Global usage gate.
 *
 * Most tools download their result with a programmatic `<a download>` click
 * (either via the shared downloadBlob() or an inline anchor). Rather than wire
 * the gate into all ~125 download sites, we intercept those clicks ONCE here:
 * for a gated tool category, the download is held, the freemium gate runs
 * (1 free → 30s → paywall), and the file is only saved once allowed.
 *
 * Tools that gate explicitly (ImageFilterTool, convert, ffmpeg…) arm a one-shot
 * bypass after they charge, so this interceptor doesn't charge them twice.
 *
 * It FAILS OPEN: any error, or a gate-API failure, lets the download proceed —
 * the gate is a monetization lever, never a reason to lose a user's file.
 */

type Phase = 'idle' | 'reward' | 'paywall';
interface UsageResponse {
  gate: 'free' | 'rewarded' | 'paywall';
  allowed: boolean;
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

/** Map a tool route to its category (the gate key). */
function categoryForPath(pathname: string | null): Category | null {
  const m = pathname?.match(/^\/tools\/([^/?#]+)/);
  if (!m) return null;
  return getTool(m[1])?.category ?? null;
}

export function UsageGateProvider() {
  const pathname = usePathname();
  const pathRef = React.useRef(pathname);
  pathRef.current = pathname;

  const [phase, setPhase] = React.useState<Phase>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [claiming, setClaiming] = React.useState(false);
  const [activeCat, setActiveCat] = React.useState<Category | null>(null);
  const activeCatRef = React.useRef<Category | null>(null);
  activeCatRef.current = activeCat;
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  React.useEffect(() => clearTimer, []);

  const settle = React.useCallback((ok: boolean) => {
    clearTimer();
    setPhase('idle');
    setClaiming(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const claim = React.useCallback(async () => {
    const cat = activeCatRef.current;
    if (!cat) return settle(false);
    setClaiming(true);
    try {
      const done = await postJson<{ success: boolean; secondsRemaining: number }>(
        '/api/usage/reward', { category: cat, action: 'complete' },
      );
      if (!done.success) { setSeconds(done.secondsRemaining || 1); setClaiming(false); return; }
      const consumed = await postJson<UsageResponse>('/api/usage', { category: cat, action: 'consume' });
      settle(consumed.allowed);
    } catch {
      settle(true); // fail open
    }
  }, [settle]);

  const startCountdown = React.useCallback((from: number) => {
    setSeconds(from);
    clearTimer();
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { clearTimer(); void claim(); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [claim]);

  const guard = React.useCallback(async (category: Category): Promise<boolean> => {
    let r: UsageResponse;
    try {
      r = await postJson<UsageResponse>('/api/usage', { category, action: 'consume' });
    } catch {
      return true; // fail open — never block a download on a gate error
    }
    if (r.allowed) return true;
    if (r.gate === 'rewarded') {
      try { await postJson('/api/usage/reward', { category, action: 'start' }); } catch { /* ignore */ }
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setActiveCat(category);
        setPhase('reward');
        startCountdown(r.rewardWaitSeconds || 30);
      });
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setActiveCat(category);
      setPhase('paywall');
    });
  }, [startCountdown]);

  // ---- Global download interceptor -------------------------------------
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const a = target?.closest?.('a[download]') as HTMLAnchorElement | null;
        if (!a) return;
        if (a.dataset.xgatePass) { delete a.dataset.xgatePass; return; } // our own re-save
        const href = a.href;
        if (!href || !(href.startsWith('blob:') || href.startsWith('data:'))) return;
        if (consumeDownloadBypass()) return; // an explicit gate already charged this action
        const cat = categoryForPath(pathRef.current);
        if (!cat || !isGated(cat)) return; // ungated tool → let the download happen natively

        // Gate it: hold the download, capture the bytes now (before the tool
        // revokes the object URL), run the gate, save only if allowed.
        e.preventDefault();
        e.stopImmediatePropagation();
        const name = a.download || 'download';
        const captured = fetch(href).then((res) => res.blob()).catch(() => null);
        void guard(cat).then(async (ok) => {
          if (!ok) return;
          const blob = await captured;
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const el = document.createElement('a');
          el.href = url;
          el.download = name;
          el.dataset.xgatePass = '1';
          document.body.appendChild(el);
          el.click();
          document.body.removeChild(el);
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        });
      } catch {
        /* never break a download */
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [guard]);

  if (phase === 'idle' || !activeCat) return null;
  return (
    <GateModal
      phase={phase}
      seconds={seconds}
      claiming={claiming}
      category={activeCat}
      onCancel={() => settle(false)}
    />
  );
}
