/**
 * Client-side handle to the image compute worker. One session per open tool.
 * The worker keeps the full-res source; the UI sends ops + params and gets
 * back transformed pixels / an encoded blob, with progress — never blocking.
 *
 * The worker bundle ships ENCRYPTED and is unlocked via the origin-gated handshake
 * (loadProtectedWorker), so acquiring it is async; sends await it (the worker is
 * cached after the first unlock).
 */

import { loadProtectedWorker } from '@/lib/protect/protected-worker';

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
  private workerP: Promise<Worker> | null = null;
  private id = 0;
  private pending = new Map<number, Pending>();
  dims: { width: number; height: number } | null = null;

  /** Unlock + instantiate the encrypted worker once; concurrent sends share it. */
  private ensure(): Promise<Worker> {
    if (this.workerP) return this.workerP;
    this.workerP = loadProtectedWorker('image')
      .then((w) => this.wire(w))
      .catch((e) => { this.workerP = null; throw e; }); // allow retry on failure
    return this.workerP;
  }

  private wire(w: Worker): Worker {
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
      // Drop the dead worker so the next operation builds a fresh one.
      // Without this, ensure() returns the broken workerP forever and every
      // subsequent call hangs with no response.
      if (this.worker === w) this.worker = null;
      this.workerP = null;
      try { w.terminate(); } catch { /* */ }
    };
    w.onmessageerror = (e: MessageEvent) => {
      const m = (e.data as Record<string, unknown> | null) ?? null;
      const id = m ? (m.id as number | undefined) : undefined;
      if (id != null) {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('Image worker message could not be cloned')); }
      }
    };
    this.worker = w;
    return w;
  }

  private async send<T>(msg: Record<string, unknown>, onProgress?: (p: Progress) => void): Promise<T> {
    const w = await this.ensure();
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
    this.workerP = null;
    // Reject any in-flight calls — otherwise callers awaiting load/preview/
    // exportImage when dispose() runs (component unmount, navigation) hang
    // forever. Clearing the map without rejecting also dropped the resolve
    // callbacks, leaving promises pending in GC roots until tab close.
    const err = new Error('Image session disposed');
    for (const p of this.pending.values()) {
      try { p.reject(err); } catch { /* */ }
    }
    this.pending.clear();
  }
}
