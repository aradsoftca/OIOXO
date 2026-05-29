/**
 * One-shot worker round-trip: post a message, resolve with the worker's reply,
 * then terminate it. The worker must reply exactly once with either the result
 * object or `{ type: 'error', message }`. Used by engines whose heavy WASM work
 * is a clean "bytes in → bytes out" call (cad, model3d), so it can run off the
 * main thread without freezing the page.
 *
 * The caller creates the Worker (webpack needs the literal
 * `new Worker(new URL('./x.worker.ts', import.meta.url))` to bundle it).
 */
export function workerOnce<T>(worker: Worker, message: unknown, transfer: Transferable[] = [], timeoutMs = 120_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    // Ceiling on how long we'll wait for a reply. A WASM module stuck in an
    // infinite loop on a malformed input would otherwise hang the user's
    // promise (and the worker thread) forever — no UI recovery short of
    // closing the tab. Default 2 min covers slow CAD/3D conversions.
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch { /* */ }
      reject(new Error('Worker timed out'));
    }, timeoutMs);
    const done = () => { settled = true; clearTimeout(watchdog); try { worker.terminate(); } catch { /* */ } };
    worker.onmessage = (e: MessageEvent) => {
      if (settled) return;
      const m = e.data as { type?: string; message?: string };
      if (m && m.type === 'error') { done(); reject(new Error(String(m.message || 'Worker error'))); }
      else { done(); resolve(m as T); }
    };
    worker.onerror = (ev) => {
      if (settled) return;
      done();
      reject(new Error(ev.message || 'Worker crashed'));
    };
    try {
      worker.postMessage(message, transfer);
    } catch (e) {
      // postMessage can throw on a detached transferable or oversize message
      // — without this catch the caller's promise would hang forever.
      if (settled) return;
      done();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** True when this context can spawn a Worker (server render / very old browsers can't). */
export function canUseWorker(): boolean {
  return typeof Worker !== 'undefined';
}
