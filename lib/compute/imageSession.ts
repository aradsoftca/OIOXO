/**
 * Client-side handle to the image compute worker. One session per open tool.
 * The worker keeps the full-res source; the UI sends ops + params and gets
 * back transformed pixels / an encoded blob, with progress — never blocking.
 */

export interface Progress { phase: string; ratio: number }
export interface ExportResult { blob: Blob; bytes: number; width: number; height: number }

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: Progress) => void;
};

/** Worker + OffscreenCanvas required for the off-thread path. */
export function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

export class ImageSession {
  private worker: Worker | null = null;
  private id = 0;
  private pending = new Map<number, Pending>();
  dims: { width: number; height: number } | null = null;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./image.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as Record<string, unknown>;
      const id = m.id as number;
      const p = this.pending.get(id);
      if (!p) return;
      switch (m.type) {
        case 'progress':
          p.onProgress?.({ phase: String(m.phase), ratio: Number(m.ratio) });
          break;
        case 'loaded':
          this.dims = { width: m.width as number, height: m.height as number };
          this.pending.delete(id);
          p.resolve(this.dims);
          break;
        case 'preview-done':
          this.pending.delete(id);
          p.resolve(new ImageData(new Uint8ClampedArray(m.buffer as ArrayBuffer), m.width as number, m.height as number));
          break;
        case 'export-done':
          this.pending.delete(id);
          p.resolve({ blob: new Blob([m.buffer as ArrayBuffer], { type: String(m.mime) }), bytes: m.bytes as number, width: m.width as number, height: m.height as number });
          break;
        case 'error':
          this.pending.delete(id);
          p.reject(new Error(String(m.message)));
          break;
      }
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Worker crashed');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  private send<T>(msg: Record<string, unknown>, onProgress?: (p: Progress) => void): Promise<T> {
    const w = this.ensure();
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      w.postMessage({ ...msg, id });
    });
  }

  load(blob: Blob) { return this.send<{ width: number; height: number }>({ type: 'load', blob }); }
  preview(op: string, params: Record<string, unknown>, onProgress?: (p: Progress) => void) {
    return this.send<ImageData>({ type: 'preview', op, params }, onProgress);
  }
  exportImage(op: string, params: Record<string, unknown>, format: string, quality: number, onProgress?: (p: Progress) => void) {
    return this.send<ExportResult>({ type: 'export', op, params, format, quality }, onProgress);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
