'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import type { Category } from '@/lib/registry/types';
import { getTool } from '@/lib/registry';
import { gateKeyForTool, displayCategoryForKey } from '@/lib/usage/config';
import { consumeDownloadBypass } from '@/lib/usage/gate-bridge';
import { registerSizeGate, type SizeGateInfo } from '@/lib/usage/size-gate';
import { brandedName, brandedNameSync } from '@/lib/watermark/download';
import { WM_DOMAIN } from '@/lib/watermark/config';
import { installCanvasWatermark, setCanvasWatermarkEnabled, installAnchorBrand } from '@/lib/watermark/canvas-patch';
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

/** Map a tool route to its gate target — the meter key + the category to display.
 *  null = the current page is not a gated tool (non-tool route, or an ungated tool). */
function gateTargetForPath(pathname: string | null): { key: string; display: Category } | null {
  const m = pathname?.match(/^\/tools\/([^/?#]+)/);
  if (!m) return null;
  const tool = getTool(m[1]);
  if (!tool) return null;
  const key = gateKeyForTool(tool.id, tool.category);
  if (!key) return null;
  return { key, display: displayCategoryForKey(key) };
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
  // The meter key (category OR per-tool id) charged for the active gate — may
  // differ from activeCat, which is only the category the modal displays.
  const activeKeyRef = React.useRef<string | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards claim() against double-fire (StrictMode + batched setSeconds
  // updater could run the inner callback twice → two /api/usage POSTs and
  // two uses consumed on a single 30-second countdown).
  const claimFired = React.useRef(false);
  // Set when the user closes the modal mid-countdown so a still-in-flight
  // claim() can no-op instead of charging the server after the caller has
  // already received `false`.
  const cancelled = React.useRef(false);
  // Watermark-on (free) state — drives the "Powered by" badge on the P2P apps.
  const [wmOn, setWmOn] = React.useState(true);
  // File-SIZE gate, raised by any Drop component via checkFreeSize().
  const [sizeGate, setSizeGate] = React.useState<SizeGateInfo | null>(null);

  React.useEffect(() => {
    registerSizeGate((info) => setSizeGate(info));
    return () => registerSizeGate(null);
  }, []);

  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  React.useEffect(() => clearTimer, []);

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

  const claim = React.useCallback(async () => {
    if (claimFired.current) return;
    claimFired.current = true;
    const key = activeKeyRef.current;
    if (!key) return settle(false);
    setClaiming(true);
    let done: { success: boolean; secondsRemaining: number };
    try {
      done = await postJson<{ success: boolean; secondsRemaining: number }>(
        '/api/usage/reward', { category: key, action: 'complete' },
      );
    } catch {
      // Network blip — let the user retry by resetting the lockout.
      claimFired.current = false;
      settle(true); // fail open
      return;
    }
    if (!done.success) {
      setSeconds(done.secondsRemaining || 1);
      setClaiming(false);
      claimFired.current = false;
      return;
    }
    if (cancelled.current) return;
    let consumed: UsageResponse;
    try {
      consumed = await postJson<UsageResponse>('/api/usage', { category: key, action: 'consume' });
    } catch {
      settle(true); // fail open after a successful reward
      return;
    }
    if (cancelled.current) return;
    settle(consumed.allowed);
  }, [settle]);

  const startCountdown = React.useCallback((from: number) => {
    setSeconds(from);
    clearTimer();
    claimFired.current = false;
    cancelled.current = false;
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearTimer();
          // Schedule outside the updater so React can't double-invoke it.
          queueMicrotask(() => { void claim(); });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [claim]);

  const guard = React.useCallback(async (key: string, display: Category): Promise<boolean> => {
    // If a prior gate is still open (two queued downloads, click-spam), reject
    // the prior resolver so the first caller's promise doesn't hang. The new
    // call then takes over the modal.
    if (resolver.current) {
      const prior = resolver.current;
      resolver.current = null;
      clearTimer();
      prior(false);
    }
    let r: UsageResponse;
    try {
      r = await postJson<UsageResponse>('/api/usage', { category: key, action: 'consume' });
    } catch {
      // FAIL-CLOSED for free, FAIL-OPEN for Pro. A free user can no longer get
      // unlimited downloads by blocking /api/usage (ad-block rule) — a gate error
      // holds the download. Pro is protected by the CACHED entitlement (grace
      // window), so a real outage never blocks a paying customer; nothing is lost
      // (the result still exists — retry the download once the gate is reachable).
      try {
        const { isWatermarkOn } = await import('@/lib/watermark/config');
        return !(await isWatermarkOn()); // Pro → allow; free → block
      } catch {
        return false; // unknown → fail closed
      }
    }
    if (r.allowed) return true;
    if (r.gate === 'rewarded') {
      try { await postJson('/api/usage/reward', { category: key, action: 'start' }); } catch { /* ignore */ }
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        activeKeyRef.current = key;
        setActiveCat(display);
        setPhase('reward');
        startCountdown(r.rewardWaitSeconds || 30);
      });
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      activeKeyRef.current = key;
      setActiveCat(display);
      setPhase('paywall');
    });
  }, [startCountdown]);

  // ---- Brand watermark wiring ------------------------------------------
  // Patch canvas exports immediately (covers the ~40 tools that toBlob/toDataURL
  // straight from a <canvas>, bypassing the engine encode path). Default ON =
  // free-safe; then, only if the session is Pro, turn BOTH the engine stamp and
  // the canvas stamp off.
  React.useEffect(() => {
    installCanvasWatermark();
    installAnchorBrand();
    (async () => {
      try {
        const { isWatermarkOn } = await import('@/lib/watermark/config');
        const on = await isWatermarkOn();
        setWmOn(on);
        if (!on) {
          const { setWatermark } = await import('@/engines/image/codec');
          setWatermark(null);
          setCanvasWatermarkEnabled(false);
          const { setFfmpegWatermark } = await import('@/engines/ffmpeg');
          setFfmpegWatermark(false);
          const { setPdfWatermark } = await import('@/engines/pdf');
          setPdfWatermark(null);
        }
      } catch { /* free-safe: leave the stamp on */ }
    })();
  }, []);

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
        if (consumeDownloadBypass()) {
          // An explicit gate (e.g. the converter, image filters) already metered
          // this action and armed a bypass so we don't double-charge — but the
          // brand filename must STILL apply, so rename before letting it through.
          try { a.download = brandedNameSync(a.download || 'download'); } catch { /* */ }
          return;
        }
        const gt = gateTargetForPath(pathRef.current);
        if (!gt) {
          // Not a gated tool: an ungated tool (generators/dev/game/text/QR…), the
          // converter (/convert/*), or a P2P app (whiteboard export, received
          // files, chat media…). No quota — but free outputs still carry the brand
          // filename. Rename in place (sync) and let the native download proceed.
          const p = pathRef.current || '';
          if (/^\/tools\//.test(p) || /^\/(convert|board|send|chat|clipboard|note|viewer|call|watch)\b/.test(p)) {
            try { a.download = brandedNameSync(a.download || 'download'); } catch { /* */ }
          }
          return;
        }

        // Gate it: hold the download, capture the bytes now (before the tool
        // revokes the object URL), run the gate, save only if allowed.
        e.preventDefault();
        e.stopImmediatePropagation();
        const name = a.download || 'download';
        const captured = fetch(href).then((res) => res.blob()).catch(() => null);
        void guard(gt.key, gt.display).then(async (ok) => {
          if (!ok) return;
          const blob = await captured;
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const el = document.createElement('a');
          el.href = url;
          el.download = await brandedName(name); // free → photo-xonvert.webp
          el.dataset.xgatePass = '1';
          document.body.appendChild(el);
          el.click();
          document.body.removeChild(el);
          // 60s defer — mobile Safari/Firefox abort the download if the blob
          // URL is torn down before the stream starts. 4s was the old value
          // that caused intermittent "download failed" reports on phones.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        });
      } catch {
        /* never break a download */
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [guard]);

  // "Powered by" badge on the live P2P apps (free only) — the session brand the
  // guest and the people they invite both see.
  const isAppRoute = /^\/(chat|call|watch|board|send|clipboard|note)(\/|$)/.test(pathname || '');
  const badge = wmOn && isAppRoute ? <PoweredByBadge /> : null;

  // The size gate is independent of the count gate (it can fire for a tool that
  // never reached its daily limit), so render it on its own.
  const sizeModal = sizeGate ? (
    <GateModal
      phase="size"
      seconds={0}
      claiming={false}
      category={sizeGate.category}
      sizeCtx={{ bytes: sizeGate.bytes, cap: sizeGate.cap }}
      onCancel={() => setSizeGate(null)}
    />
  ) : null;

  if (phase === 'idle' || !activeCat) return <>{badge}{sizeModal}</>;
  return (
    <>
      {badge}
      {sizeModal}
      <GateModal
        phase={phase}
        seconds={seconds}
        claiming={claiming}
        category={activeCat}
        onCancel={cancel}
      />
    </>
  );
}

function PoweredByBadge() {
  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[90] select-none rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur-sm"
      aria-hidden
    >
      Powered by {WM_DOMAIN}
    </div>
  );
}
