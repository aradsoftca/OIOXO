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
import { getPolicy } from '@/lib/limits/policy';
import { installCanvasWatermark, setCanvasWatermarkEnabled, installAnchorBrand } from '@/lib/watermark/canvas-patch';
import { GateModal } from './use-usage-gate';
import { funnel } from '@/lib/funnel';
import { installAppBridge, isInApp, requestRewardedAd } from '@/lib/app-bridge';

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

/**
 * Does the current tool route opt OUT of the filename brand? A tool whose policy
 * declares `watermarkFree: false` (raw format conversions, audio convert/merge,
 * transcription, encrypt/dev utilities) is a function-utility, not an asset — its
 * output must stay clean, including the `-xonvert` filename suffix. We resolve by
 * the tool id first (per-tool policy), then its category. Defaults to "do brand"
 * (returns false) when there's no policy — the free-safe default. Pure/sync so the
 * capture-phase interceptor can call it before the browser acts on a.download.
 */
function isCleanIntentPath(pathname: string | null): boolean {
  const m = pathname?.match(/^\/tools\/([^/?#]+)/);
  if (!m) return false;
  const tool = getTool(m[1]);
  if (!tool) return false;
  const policy = getPolicy(tool.id) ?? getPolicy(tool.category);
  return policy ? policy.watermarkFree === false : false;
}

export function UsageGateProvider() {
  const pathname = usePathname();
  const pathRef = React.useRef(pathname);
  pathRef.current = pathname;

  // Publish the active tool id to the engines (audio/image/ffmpeg) so their
  // embedded brand can honor a clean-intent tool's policy (watermarkFree:false).
  React.useEffect(() => {
    const m = pathname?.match(/^\/tools\/([^/?#]+)/);
    const tool = m ? getTool(m[1]) : undefined;
    void (async () => {
      try {
        const { setCurrentToolKey } = await import('@/lib/watermark/config');
        setCurrentToolKey(tool?.id, tool?.category);
      } catch { /* ignore */ }
    })();
  }, [pathname]);

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
    // Inside the mobile app the unlock is a rewarded ad (the paywall shows the
    // "watch an ad" button), not the web's 30-second countdown.
    if (r.gate === 'rewarded' && !isInApp()) {
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

  // Mobile app: finished ad → AdMob's server callback adds the uses; re-check the
  // meter a few times while that callback lands, then let the held download through.
  const watchAd = React.useCallback(async () => {
    const key = activeKeyRef.current;
    if (!key) return;
    setClaiming(true);
    cancelled.current = false;
    const watched = await requestRewardedAd(key).catch(() => false);
    if (!watched || cancelled.current) { setClaiming(false); return; }
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled.current) return;
      try {
        const r = await postJson<UsageResponse>('/api/usage', { category: key, action: 'consume' });
        if (r.allowed) { funnel('ad_reward'); return settle(true); }
      } catch { /* retry */ }
    }
    setClaiming(false);
  }, [settle]);

  React.useEffect(() => { installAppBridge(); }, []);

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
          // Video Studio compositor burns an in-frame mark (the WebCodecs encode
          // path bypasses the global toBlob patch) — turn it off for Pro too.
          const { setVideoWatermark } = await import('@/engines/video/compositor');
          setVideoWatermark(false);
        }
      } catch { /* free-safe: leave the stamp on */ }
    })();
  }, []);

  // ---- "Remove the brand mark with Pro" nudge ------------------------------
  // Shown after a free download that got the brand (renamed file / stamped
  // output), at most once a day per browser: the one upgrade moment every
  // free user reaches, and until now nothing pointed at it.
  const [brandNudge, setBrandNudge] = React.useState(false);
  const nudgeBrand = React.useCallback(() => {
    try {
      const k = 'xv-brand-nudge';
      const day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(k) === day) return;
      localStorage.setItem(k, day);
    } catch { /* storage blocked: still show once this page view */ }
    setBrandNudge(true);
  }, []);
  const brandRename = React.useCallback((a: HTMLAnchorElement) => {
    try {
      const before = a.download || 'download';
      const after = brandedNameSync(before);
      a.download = after;
      if (after !== before) nudgeBrand();
    } catch { /* */ }
  }, [nudgeBrand]);

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
          // brand filename must STILL apply (unless this tool is clean-intent).
          if (!isCleanIntentPath(pathRef.current)) brandRename(a);
          return;
        }
        const gt = gateTargetForPath(pathRef.current);
        if (!gt) {
          // Not a gated tool: an ungated tool (generators/dev/game/text/QR…), the
          // converter (/convert/*), or a P2P app (whiteboard export, received
          // files, chat media…). No quota — but free outputs still carry the brand
          // filename. Rename in place (sync) and let the native download proceed.
          const p = pathRef.current || '';
          if ((/^\/tools\//.test(p) || /^\/(convert|board|send|chat|clipboard|note|viewer|call|watch)\b/.test(p)) && !isCleanIntentPath(p)) {
            brandRename(a);
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
          // free → photo-xonvert.webp, unless the tool is clean-intent (watermarkFree:false)
          el.download = isCleanIntentPath(pathRef.current) ? name : await brandedName(name);
          if (el.download !== name) nudgeBrand();
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
  }, [guard, brandRename, nudgeBrand]);

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

  const nudge = brandNudge ? <BrandNudge onClose={() => setBrandNudge(false)} /> : null;
  if (phase === 'idle' || !activeCat) return <>{badge}{sizeModal}{nudge}</>;
  return (
    <>
      {badge}
      {sizeModal}
      {nudge}
      <GateModal
        phase={phase}
        seconds={seconds}
        claiming={claiming}
        category={activeCat}
        onCancel={cancel}
        onWatchAd={phase === 'paywall' && isInApp() ? watchAd : undefined}
      />
    </>
  );
}

function BrandNudge({ onClose }: { onClose: () => void }) {
  React.useEffect(() => { funnel('nudge_shown'); }, []);
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[95] flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 border border-black/[0.1] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-fg)] shadow-xl">
      <span className="flex-1">Saved with a small {WM_DOMAIN} mark. Remove it — and every daily limit — with Pro, $4.99/mo.</span>
      <a href="/pricing" onClick={() => funnel('nudge_click')} className="inline-flex min-h-[40px] shrink-0 items-center bg-[var(--color-fg)] px-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)]">Go Pro</a>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-10 w-10 shrink-0 place-items-center text-[18px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">×</button>
    </div>
  );
}

function PoweredByBadge() {
  // bottom-RIGHT, not bottom-left: the account avatar (and, in dev, the error
  // overlay) live at bottom-left and were overlapping this badge — the avatar
  // covered the start of the text, leaving a clipped "…ered by xonvert.com"
  // that looked broken. Bottom-right is the conventional spot and stays clear.
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[90] select-none rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur-sm"
      aria-hidden
    >
      Powered by {WM_DOMAIN}
    </div>
  );
}
