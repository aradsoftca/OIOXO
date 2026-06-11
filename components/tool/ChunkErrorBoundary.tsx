'use client';

import React from 'react';

/**
 * Catches the "ChunkLoadError" / "Invalid or unexpected token" class of failures
 * that happen when a lazily-imported studio chunk fails to load (a corrupt or
 * stale cache entry, a chunk that 404s after a deploy, a flaky network). Without
 * this, Next's `dynamic()` shows its loading spinner FOREVER and the studio is
 * stuck on "Loading your studio…" with no recovery — exactly the bricking found
 * in the brutal audit.
 *
 * Recovery strategy:
 *   1. First failure → hard-reload once, bypassing the HTTP+SW cache, so the
 *      browser re-fetches a fresh chunk. A sessionStorage guard makes this a
 *      one-shot so we never loop.
 *   2. If it still fails after the reload → show a real error card with a
 *      "Reload" button and a "Clear cache & reload" escape hatch that unregisters
 *      the service worker and deletes Cache Storage (the root cause of stale
 *      chunks), then reloads.
 */

const RELOAD_GUARD_KEY = 'xv:chunk-reload-attempted';

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w/.-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Invalid or unexpected token/i.test(msg)
  );
}

async function clearCachesAndReload() {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => undefined)));
    }
  } catch {
    /* best-effort */
  } finally {
    try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ignore */ }
    location.reload();
  }
}

interface Props {
  children: React.ReactNode;
  /** Shown while we auto-reload, and behind the error card. */
  fallback?: React.ReactNode;
}

interface State {
  phase: 'ok' | 'reloading' | 'failed';
}

export class ChunkErrorBoundary extends React.Component<Props, State> {
  state: State = { phase: 'ok' };

  static getDerivedStateFromError(err: unknown): Partial<State> | null {
    if (!isChunkLoadError(err)) {
      // Not a chunk problem — rethrow by not handling it (let it bubble to the
      // nearest app error boundary). We can't literally rethrow here, so we keep
      // phase 'ok' and React will surface it via the next error boundary.
      return null;
    }
    let attempted = false;
    try { attempted = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'; } catch { /* ignore */ }
    return { phase: attempted ? 'failed' : 'reloading' };
  }

  componentDidCatch(err: unknown) {
    if (!isChunkLoadError(err)) throw err;
    if (this.state.phase === 'reloading') {
      try { sessionStorage.setItem(RELOAD_GUARD_KEY, '1'); } catch { /* ignore */ }
      // Reload with cache bypass. A cache-busting query forces a fresh document;
      // the SW fix already stops it caching app chunks, but this covers HTTP cache.
      const url = new URL(location.href);
      url.searchParams.set('_r', String(Date.now()));
      location.replace(url.toString());
    }
  }

  componentDidMount() {
    // A successful mount means the chunk loaded — clear the one-shot guard so a
    // FUTURE failure can still trigger one auto-reload.
    try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ignore */ }
  }

  render() {
    if (this.state.phase === 'reloading') {
      return (
        this.props.fallback ?? (
          <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-[#0c0d10] text-zinc-400">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
            <div className="text-[13px] font-medium tracking-wide text-zinc-500">Recovering your studio…</div>
          </div>
        )
      );
    }

    if (this.state.phase === 'failed') {
      return (
        <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-5 bg-[#0c0d10] px-6 text-center text-zinc-300">
          <div className="text-[15px] font-semibold text-zinc-100">This studio failed to load</div>
          <div className="max-w-sm text-[13px] leading-relaxed text-zinc-500">
            A part of the editor couldn’t be downloaded — usually a cached old
            version after an update. Clearing the cache fixes it.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => { try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ignore */ } location.reload(); }}
              className="rounded-lg border border-white/15 px-4 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/5"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={clearCachesAndReload}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-cyan-400"
            >
              Clear cache &amp; reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
