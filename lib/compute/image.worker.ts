/// <reference lib="webworker" />
/**
 * Image compute worker. Holds the decoded full-resolution image and runs
 * decode / transform / encode entirely OFF the main thread, so the UI never
 * blocks regardless of image size or device speed. Pixels are moved with
 * Transferable ArrayBuffers (zero-copy).
 */

import { decode, encode } from '../../engines/image/codec';
import { OPS } from '../../engines/image/ops';

type In =
  | { type: 'load'; id: number; blob: Blob }
  | { type: 'preview'; id: number; op: string; params: Record<string, unknown> }
  | { type: 'export'; id: number; op: string; params: Record<string, unknown>; format: string; quality: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let source: ImageData | null = null;

function post(msg: Record<string, unknown>, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

ctx.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      const { data } = await decode(m.blob);
      source = data;
      post({ type: 'loaded', id: m.id, width: data.width, height: data.height });
      return;
    }
    if (!source) { post({ type: 'error', id: m.id, message: 'No image loaded.' }); return; }
    const op = OPS[m.op];
    if (!op) { post({ type: 'error', id: m.id, message: `Unknown op: ${m.op}` }); return; }

    if (m.type === 'preview') {
      post({ type: 'progress', id: m.id, phase: 'Processing', ratio: 0.2 });
      const out = await op(source, m.params || {});
      const buf = out.data.buffer;
      post({ type: 'preview-done', id: m.id, width: out.width, height: out.height, buffer: buf }, [buf]);
      return;
    }

    if (m.type === 'export') {
      post({ type: 'progress', id: m.id, phase: 'Processing', ratio: 0.25 });
      const out = await op(source, m.params || {});
      post({ type: 'progress', id: m.id, phase: 'Encoding', ratio: 0.6 });
      const { blob, bytes } = await encode(out, m.format as never, { quality: m.quality });
      const ab = await blob.arrayBuffer();
      post({ type: 'progress', id: m.id, phase: 'Done', ratio: 1 });
      post({ type: 'export-done', id: m.id, buffer: ab, mime: blob.type, bytes, width: out.width, height: out.height }, [ab]);
      return;
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: (err as Error).message || String(err) });
  }
};
