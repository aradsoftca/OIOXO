/**
 * Main-thread client for the image codec worker. A single shared worker
 * serializes decode/encode requests off the UI thread, so jsquash's WASM never
 * blocks. Buffers move zero-copy.
 */

import type { DecodeResult, EncodeResult } from '@/engines/image/codec';
import type { EncodeOptions, ImageFormat } from '@/engines/image/types';
import { startJob, updateJob, endJob } from './progressBus';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ensure(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./codec.worker.ts', import.meta.url));
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
  };
  worker = w;
  return w;
}

export function codecDecode(blob: Blob): Promise<DecodeResult> {
  const w = ensure();
  const id = ++seq;
  startJob('Reading'); updateJob('Reading', 0.5);
  return new Promise<DecodeResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ type: 'decode', id, blob });
  }).finally(endJob);
}

export function codecEncode(data: ImageData, format: ImageFormat, opts: EncodeOptions): Promise<EncodeResult> {
  const w = ensure();
  const id = ++seq;
  startJob('Encoding'); updateJob('Encoding', 0.5);
  // Copy the pixels so the caller's ImageData stays usable, then transfer the copy.
  const copy = data.data.slice().buffer;
  return new Promise<EncodeResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ type: 'encode', id, buffer: copy, width: data.width, height: data.height, format, opts }, [copy]);
  }).finally(endJob);
}
