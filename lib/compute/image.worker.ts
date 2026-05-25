/// <reference lib="webworker" />
/**
 * Image compute worker. Holds the decoded full-resolution image and runs
 * decode / transform / encode entirely OFF the main thread, so the UI never
 * blocks regardless of image size or device speed. Pixels are moved with
 * Transferable ArrayBuffers (zero-copy).
 *
 * LIVE PREVIEW runs against a DOWNSCALED copy of the source (capped to
 * PREVIEW_MAX_EDGE). A phone photo is 12–50 MP; transforming + transferring +
 * painting that on every slider tick is what froze weak devices. The preview
 * only needs to look right at display size, so we process ~2 MP instead — fast
 * and smooth — while DOWNLOAD still runs the op on the full-resolution source.
 *
 * Size-dependent params (blur radius, pixel block, border width, …) are scaled
 * by the same factor for the preview so the downscaled result matches export.
 */

import { decode, encode } from '../../engines/image/codec';
import { OPS } from '../../engines/image/ops';

type In =
  | { type: 'load'; id: number; blob: Blob }
  | { type: 'preview'; id: number; op: string; params: Record<string, unknown> }
  | { type: 'export'; id: number; op: string; params: Record<string, unknown>; format: string; quality: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Longest edge (px) of the image the live preview is computed against. */
const PREVIEW_MAX_EDGE = 1600;

/**
 * Params measured in SOURCE PIXELS that must be multiplied by the preview
 * scale so the downscaled preview matches what export produces at full res.
 * Scale-invariant params (brightness, hue, percentages, fractions, angles…)
 * are intentionally absent.
 */
const SCALE_PARAMS: Record<string, string[]> = {
  blur: ['blurPx'],
  pixelate: ['size'],
  border: ['width'],
  roundCorners: ['radius'],
  crop: ['x', 'y', 'width', 'height'],
};

let source: ImageData | null = null;       // full resolution — used for export
let preview: ImageData | null = null;       // downscaled — used for live preview
let previewScale = 1;                       // preview.width / source.width

function post(msg: Record<string, unknown>, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

/** Downscale an ImageData so its longest edge is <= maxEdge (no upscaling). */
function downscale(img: ImageData, maxEdge: number): { data: ImageData; scale: number } {
  const longest = Math.max(img.width, img.height);
  if (longest <= maxEdge) return { data: img, scale: 1 };
  const scale = maxEdge / longest;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const full = new OffscreenCanvas(img.width, img.height);
  full.getContext('2d')!.putImageData(img, 0, 0);
  const small = new OffscreenCanvas(w, h);
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, w, h);
  return { data: sctx.getImageData(0, 0, w, h), scale: w / img.width };
}

/** Multiply the source-pixel params for `op` by the preview scale factor. */
function scaleParams(op: string, params: Record<string, unknown>, scale: number): Record<string, unknown> {
  const keys = SCALE_PARAMS[op];
  if (scale >= 1 || !keys) return params;
  const out = { ...params };
  for (const k of keys) {
    if (typeof out[k] === 'number') out[k] = (out[k] as number) * scale;
  }
  return out;
}

ctx.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      const { data } = await decode(m.blob);
      source = data;
      const ds = downscale(data, PREVIEW_MAX_EDGE);
      preview = ds.data;
      previewScale = ds.scale;
      post({ type: 'loaded', id: m.id, width: data.width, height: data.height });
      return;
    }
    if (!source) { post({ type: 'error', id: m.id, message: 'No image loaded.' }); return; }
    const op = OPS[m.op];
    if (!op) { post({ type: 'error', id: m.id, message: `Unknown op: ${m.op}` }); return; }

    if (m.type === 'preview') {
      post({ type: 'progress', id: m.id, phase: 'Processing', ratio: 0.2 });
      const params = scaleParams(m.op, m.params || {}, previewScale);
      const out = await op(preview ?? source, params);
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
