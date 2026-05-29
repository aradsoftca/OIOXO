/**
 * Main-thread client for the image codec worker. A single shared worker
 * serializes decode/encode requests off the UI thread, so jsquash's WASM never
 * blocks. Buffers move zero-copy.
 */

import type { DecodeResult, EncodeResult } from '@/engines/image/codec';
import type { EncodeOptions, ImageFormat } from '@/engines/image/types';
import { loadProtectedWorker } from '@/lib/protect/protected-worker';
import { startJob, updateJob, endJob } from './progressBus';

let worker: Worker | null = null;
let workerP: Promise<Worker> | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

/** Unlock + instantiate the encrypted codec worker once; concurrent calls share it. */
function ensure(): Promise<Worker> {
  if (workerP) return workerP;
  workerP = loadProtectedWorker('codec').then(wire).catch((e) => { workerP = null; throw e; });
  return workerP;
}

function wire(w: Worker): Worker {
  w.onmessage = (e: MessageEvent) => {
    const m = e.data as Record<string, unknown>;
    const p = pending.get(m.id as number);
    if (!p) return;
    pending.delete(m.id as number);
    if (m.type === 'decoded') {
      p.resolve({
        data: new ImageData(new Uint8ClampedArray(m.buffer as ArrayBuffer), m.width as number, m.height as number),
        format: m.format,
        ms: 0,
      });
    } else if (m.type === 'encoded') {
      const blob = new Blob([m.buffer as ArrayBuffer], { type: String(m.mime) });
      p.resolve({ blob, bytes: m.bytes as number, ms: 0 });
    } else if (m.type === 'error') {
      p.reject(new Error(String(m.message)));
    }
  };
  w.onerror = (ev) => {
    const err = new Error(ev.message || 'Codec worker failed');
    pending.forEach((p) => p.reject(err));
    pending.clear();
    // The worker is dead — drop our references so the next request triggers
    // a fresh load instead of hanging on the corpse forever.
    if (worker === w) worker = null;
    workerP = null;
    try { w.terminate(); } catch { /* */ }
  };
  // A structured-clone failure on the receiving side fires here; reject the
  // matching pending request so the caller sees the error instead of hanging.
  w.onmessageerror = (e: MessageEvent) => {
    const m = (e.data as Record<string, unknown> | null) ?? null;
    const id = m ? (m.id as number | undefined) : undefined;
    if (id != null) {
      const p = pending.get(id);
      if (p) { pending.delete(id); p.reject(new Error('Codec worker message could not be cloned')); }
    }
  };
  worker = w;
  return w;
}

export async function codecDecode(blob: Blob): Promise<DecodeResult> {
  const w = await ensure();
  const id = ++seq;
  startJob('Reading'); updateJob('Reading', 0.5);
  return new Promise<DecodeResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ type: 'decode', id, blob });
  }).finally(endJob);
}

export async function codecEncode(data: ImageData, format: ImageFormat, opts: EncodeOptions): Promise<EncodeResult> {
  const w = await ensure();
  const id = ++seq;
  startJob('Encoding'); updateJob('Encoding', 0.5);
  // Copy the pixels so the caller's ImageData stays usable, then transfer the copy.
  const copy = data.data.slice().buffer;
  return new Promise<EncodeResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ type: 'encode', id, buffer: copy, width: data.width, height: data.height, format, opts }, [copy]);
  }).finally(endJob);
}
