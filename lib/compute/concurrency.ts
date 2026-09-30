/**
 * One concurrency + memory policy for the whole app, so every heavy path makes
 * the same trade-off: use most of the machine, but always leave headroom.
 *
 * The goal is "as fast as possible without freezing or crashing":
 *  - Cap parallelism below the core count so the UI/system stays responsive
 *    (no "the whole machine locked up" feeling), and because WASM/codec gains
 *    plateau by ~4 lanes while memory keeps climbing.
 *  - Back off on low-memory devices, where running everything wide OOM-crashes
 *    the tab.
 *
 * Works on the main thread and inside Workers (both expose navigator).
 */

import { isMemoryConstrained } from './device-profile';

/** Reported CPU cores, with a safe default when the browser hides it. */
export function cpuCores(): number {
  try {
    return (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  } catch {
    return 4;
  }
}

/** True when the device reports limited RAM (coarse, capped at 8 by browsers). */
export function isLowMemory(): boolean {
  try {
    const dm = (navigator as { deviceMemory?: number }).deviceMemory;
    return typeof dm === 'number' && dm < 4;
  } catch {
    return false;
  }
}

/**
 * How many parallel lanes to use for heavy work (threads, workers, in-flight
 * jobs). Leaves a core free and caps at 4; drops to 2 on low-memory devices.
 */
export function niceThreadCount(): number {
  const cap = isLowMemory() ? 2 : 4;
  return Math.max(1, Math.min(cpuCores() - 1, cap));
}

/**
 * Tune transformers.js / onnxruntime-web for speed without freezing the page:
 *  - multi-threaded WASM (only effective with cross-origin isolation, which we
 *    ship via COOP/COEP) — 2-4x over the single-threaded default. ORT spawns its
 *    own worker threads for the heavy matmul, so the main thread isn't the
 *    bottleneck,
 *  - SIMD on.
 * We intentionally do NOT set `proxy` — it moves data marshalling across a
 * worker boundary and has v2 edge cases; the thread pool is the safe big win.
 * Pass the imported `@xenova/transformers` module. Best-effort: never throws.
 */
/**
 * iPhone: WebKit's back/forward cache keeps a left page — model and all — alive
 * in the same WebContent process, so the NEXT AI tool loads a second model on top
 * and WebKit terminates the page (measured 09-29: the second AI tool in a session
 * died, the same tool passed in a fresh process). A page with an `unload` listener
 * is never put in that cache. Only on memory-constrained devices.
 */
let bfcacheOptOut = false;
function keepOutOfBackForwardCache(): void {
  if (bfcacheOptOut || typeof window === 'undefined' || !isMemoryConstrained()) return;
  bfcacheOptOut = true;
  window.addEventListener('unload', () => { /* presence alone disables the bfcache */ });
}

export function configureOnnxRuntime(lib: unknown): void {
  // A model is (about to be) resident: lib/app-bridge.ts skips the in-app ad on
  // memory-constrained devices so the ad's web view doesn't get this page killed.
  (globalThis as { __xvHeavyModel?: boolean }).__xvHeavyModel = true;
  keepOutOfBackForwardCache();
  try {
    const wasm = (lib as { env?: { backends?: { onnx?: { wasm?: Record<string, unknown> } } } })
      ?.env?.backends?.onnx?.wasm;
    if (!wasm) return;
    const isolated = typeof globalThis !== 'undefined'
      && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    // iOS/low-memory: one thread. Each ORT thread is a worker with its own
    // stack + scratch in the shared WASM heap, and iOS WebKit kills the page
    // far below what a multi-threaded session can reach.
    wasm.numThreads = isolated && !isMemoryConstrained() ? niceThreadCount() : 1;
    wasm.simd = true;
  } catch {
    /* best-effort */
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once (default:
 * niceThreadCount). Preserves input order in the result. Faster than a serial
 * loop, bounded so a big batch can't spike memory or saturate every core.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = niceThreadCount(),
  onSettled?: (completed: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let completed = 0;
  // When one worker throws, Promise.all rejects but the OTHER workers would
  // happily keep grinding through items in the background — wasted CPU, and
  // potentially DB/network side effects after the caller already moved on.
  // This flag short-circuits sibling lanes on first failure.
  let failed = false;
  const lanes = Math.max(1, Math.min(limit, items.length));

  async function worker() {
    while (next < items.length) {
      if (failed) return;
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
      completed++;
      onSettled?.(completed);
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}
