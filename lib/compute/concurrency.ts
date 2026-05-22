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
export function configureOnnxRuntime(lib: unknown): void {
  try {
    const wasm = (lib as { env?: { backends?: { onnx?: { wasm?: Record<string, unknown> } } } })
      ?.env?.backends?.onnx?.wasm;
    if (!wasm) return;
    const isolated = typeof globalThis !== 'undefined'
      && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    wasm.numThreads = isolated ? niceThreadCount() : 1;
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
  const lanes = Math.max(1, Math.min(limit, items.length));

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      completed++;
      onSettled?.(completed);
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}
