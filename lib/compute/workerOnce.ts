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
export function workerOnce<T>(worker: Worker, message: unknown, transfer: Transferable[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; message?: string };
      if (m && m.type === 'error') reject(new Error(String(m.message || 'Worker error')));
      else resolve(m as T);
      worker.terminate();
    };
    worker.onerror = (ev) => {
      reject(new Error(ev.message || 'Worker crashed'));
      worker.terminate();
    };
    worker.postMessage(message, transfer);
  });
}

/** True when this context can spawn a Worker (server render / very old browsers can't). */
export function canUseWorker(): boolean {
  return typeof Worker !== 'undefined';
}
