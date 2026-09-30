/**
 * Super-resolution engine — upscales an image with a small browser-resident
 * model from transformers.js. Tile inference keeps memory bounded for larger
 * inputs.
 *
 * Speed/quality knobs:
 *   - factor: 2 | 4
 *   - quality: "fast" (lightweight) | "balanced" (classical) | "real-world"
 */

import { configureOnnxRuntime } from '@/lib/compute/concurrency';
import { isMemoryConstrained, LOW_MEM, DeviceLimitError, IPHONE_MEMORY_MESSAGE } from '@/lib/compute/device-profile';

export type UpscaleFactor = 2 | 4;
export type UpscaleQuality = 'fast' | 'balanced' | 'real-world';

export interface UpscaleProgress {
  phase: string;
  ratio: number; // 0..1
}

export interface UpscaleOptions {
  factor?: UpscaleFactor;
  quality?: UpscaleQuality;
  /** Tile edge in source pixels. Larger = faster but more RAM. Default 192. */
  tile?: number;
  /** Overlap between tiles to hide seams. Default 16. */
  overlap?: number;
  /** Output MIME type. Default image/png. */
  format?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** JPEG/WebP quality 0..1. Default 0.92. */
  encodeQuality?: number;
  onProgress?: (p: UpscaleProgress) => void;
  /** Per-action permission ticket — when set, engine asserts server-side
   *  before any work. Bypass requires the server's HMAC secret (it isn't in
   *  the client bundle), so a clone has no path here. */
  permission?: import('@/lib/limits/permission').Permission | null;
  toolKey?: string;
  inputHash?: string;
}

function pickModel(factor: UpscaleFactor, quality: UpscaleQuality): string {
  if (factor === 2) {
    return quality === 'fast'
      ? 'Xenova/swin2SR-lightweight-x2-64'
      : 'Xenova/swin2SR-classical-sr-x2-64';
  }
  // factor === 4
  if (quality === 'real-world') return 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr';
  return 'Xenova/swin2SR-classical-sr-x4-64';
}

type Pipeline = (input: unknown) => Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
type LibType = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let cached: { key: string; pipeline: Pipeline; lib: LibType } | null = null;

async function getPipeline(factor: UpscaleFactor, quality: UpscaleQuality, onProgress?: (p: UpscaleProgress) => void): Promise<{ pipeline: Pipeline; lib: LibType }> {
  const model = pickModel(factor, quality);
  if (cached && cached.key === model) return { pipeline: cached.pipeline, lib: cached.lib };
  // Dispose the previously cached pipeline before loading a new one. ESRGAN
  // model bundles + their ONNX sessions can each pin tens of MB; switching
  // factor/quality without disposing leaked one copy per switch.
  if (cached) {
    try { (cached.pipeline as unknown as { dispose?: () => Promise<void> | void }).dispose?.(); } catch { /* */ }
    cached = null;
  }

  // transformers.js v3 first: v2 (@xenova 2.17.2) imports ort-wasm-simd-threaded.jsep.mjs,
  // which its ORT never shipped → 404 in the cross-origin-isolated tab (same fix as
  // engines/transcribe). Found live by scripts/live_sweep.mjs.
  const lib: LibType = await import('@huggingface/transformers').catch(() => null) ?? await import('@xenova/transformers');
  lib.env.allowLocalModels = false;
  lib.env.allowRemoteModels = true;
  // Multi-threaded WASM + SIMD + proxy worker: faster inference, no UI freeze.
  configureOnnxRuntime(lib);
  if (String(lib.env?.version ?? '').startsWith('3')) try { lib.env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/'; } catch { /* */ } // match the bundled ORT JS (1.21) — else "_OrtGetInputName is not a function" (lib/studios/ai-bgremove.ts)

  const pipeline = await lib.pipeline('image-to-image', model, {
    progress_callback: (data: { status: string; progress?: number; loaded?: number; total?: number }) => {
      if (!onProgress) return;
      const ratio = data.progress != null ? data.progress / 100
        : (data.loaded && data.total ? data.loaded / data.total : 0);
      const phase = data.status === 'progress' || data.status === 'download' || data.status === 'initiate' ? 'Loading model'
        : data.status === 'ready' ? 'Ready'
        : data.status;
      onProgress({ phase, ratio: Math.max(0, Math.min(1, ratio)) });
    },
  }) as unknown as Pipeline;

  cached = { key: model, pipeline, lib };
  return { pipeline, lib };
}

export async function upscale(blob: Blob, opts: UpscaleOptions = {}): Promise<Blob> {
  if (opts.permission?.ticket && opts.toolKey) {
    const { assertPermission } = await import('@/lib/limits/permission');
    await assertPermission(opts.permission, opts.toolKey, opts.inputHash ?? '');
  }
  const factor = opts.factor ?? 2;
  const lowMem = isMemoryConstrained();
  // iPhone: x2 always uses the lightweight Swin2SR (the classical/real-world
  // variants' window attention on each tile is what blew the WebView's heap);
  // x4 has no lightweight variant, so it keeps classical with small tiles.
  let quality = opts.quality ?? 'fast';
  if (lowMem && factor === 2) quality = 'fast';
  if (lowMem && factor === 4 && quality === 'real-world') quality = 'balanced';
  const tile = lowMem ? LOW_MEM.upscaleTile : Math.max(64, Math.min(512, opts.tile ?? 192));
  const overlap = lowMem ? LOW_MEM.upscaleOverlap : Math.max(0, Math.min(48, opts.overlap ?? 16));
  const format = opts.format ?? 'image/png';

  opts.onProgress?.({ phase: 'Reading image', ratio: 0 });
  const bm = await createImageBitmap(blob);
  let srcW = bm.width;
  let srcH = bm.height;

  if (lowMem) {
    if (srcW * srcH > LOW_MEM.maxSourcePixels) {
      bm.close();
      throw new DeviceLimitError(`${IPHONE_MEMORY_MESSAGE} for a ${Math.round((srcW * srcH) / 1e6)} MP image — try a smaller image.`);
    }
    // Cap the OUTPUT long edge (iOS caps total canvas memory, and a 4x of a
    // phone photo would be a >100 MP canvas): shrink the source so
    // source x factor fits, before any model loads.
    const maxSrcEdge = Math.floor(LOW_MEM.upscaleMaxOutputEdge / factor);
    const scale = Math.min(1, maxSrcEdge / Math.max(srcW, srcH));
    if (scale < 1) {
      srcW = Math.max(1, Math.round(srcW * scale));
      srcH = Math.max(1, Math.round(srcH * scale));
    }
  }

  // Render source to a canvas so we can slice tiles (scaled on the low-memory
  // profile when the output cap applies; 1:1 otherwise).
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) { bm.close(); throw new Error('Canvas not available'); }
  if (srcW === bm.width && srcH === bm.height) srcCtx.drawImage(bm, 0, 0);
  else { srcCtx.imageSmoothingQuality = 'high'; srcCtx.drawImage(bm, 0, 0, srcW, srcH); }
  bm.close();

  opts.onProgress?.({ phase: 'Loading model', ratio: 0.05 });
  const { pipeline, lib } = await getPipeline(factor, quality, opts.onProgress);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = srcW * factor;
  outCanvas.height = srcH * factor;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas not available');

  const step = tile - overlap;
  const totalTiles = Math.max(1, Math.ceil(srcW / step) * Math.ceil(srcH / step));
  let processed = 0;

  for (let y = 0; y < srcH; y += step) {
    for (let x = 0; x < srcW; x += step) {
      const tw = Math.min(tile, srcW - x);
      const th = Math.min(tile, srcH - y);
      if (tw <= 0 || th <= 0) continue;

      // Slice the tile out of the source canvas.
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tw;
      tileCanvas.height = th;
      const tctx = tileCanvas.getContext('2d');
      if (!tctx) continue;
      tctx.drawImage(srcCanvas, x, y, tw, th, 0, 0, tw, th);

      // Convert tile to a blob URL so transformers.js' image loader can read it.
      const tileBlob: Blob = await new Promise((resolve, reject) => {
        tileCanvas.toBlob((b) => b ? resolve(b) : reject(new Error('blob failed')), 'image/png');
      });
      const tileUrl = URL.createObjectURL(tileBlob);

      try {
        const raw = await pipeline(tileUrl);
        // Build an ImageData from the model output and paint into the result canvas.
        const outW = raw.width;
        const outH = raw.height;
        const rgba = new Uint8ClampedArray(outW * outH * 4);
        if (raw.channels === 3) {
          for (let i = 0, j = 0; i < raw.data.length; i += 3, j += 4) {
            rgba[j] = raw.data[i];
            rgba[j + 1] = raw.data[i + 1];
            rgba[j + 2] = raw.data[i + 2];
            rgba[j + 3] = 255;
          }
        } else {
          rgba.set(raw.data);
        }
        const id = new ImageData(rgba, outW, outH);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = outW;
        tmpCanvas.height = outH;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (!tmpCtx) continue;
        tmpCtx.putImageData(id, 0, 0);

        // Crop the overlap on right/bottom edges before stamping (except at last tile).
        const halfOverlap = (overlap * factor) / 2;
        const isRightEdge = x + tw >= srcW;
        const isBottomEdge = y + th >= srcH;
        const isLeftEdge = x === 0;
        const isTopEdge = y === 0;
        const sx = isLeftEdge ? 0 : halfOverlap;
        const sy = isTopEdge ? 0 : halfOverlap;
        const sw = outW - sx - (isRightEdge ? 0 : halfOverlap);
        const sh = outH - sy - (isBottomEdge ? 0 : halfOverlap);
        const dx = (x + sx / factor) * factor;
        const dy = (y + sy / factor) * factor;
        outCtx.drawImage(tmpCanvas, sx, sy, sw, sh, dx, dy, sw, sh);
        // iOS counts canvas backing stores against a hard total; zero them now
        // instead of waiting for GC between tiles.
        if (lowMem) { tmpCanvas.width = 0; tmpCanvas.height = 0; }
      } catch (err) {
        console.error('tile upscale failed', err);
      } finally {
        URL.revokeObjectURL(tileUrl);
        if (lowMem) { tileCanvas.width = 0; tileCanvas.height = 0; }
      }

      processed++;
      opts.onProgress?.({ phase: 'Upscaling', ratio: 0.1 + 0.85 * (processed / totalTiles) });
    }
  }

  // RawImage utility not needed if we used canvas directly; reference lib to silence lint.
  void lib;

  if (lowMem) { srcCanvas.width = 0; srcCanvas.height = 0; }
  opts.onProgress?.({ phase: 'Encoding', ratio: 0.97 });
  const out: Blob = await new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('encode failed')),
      format,
      opts.encodeQuality ?? 0.92,
    );
  });
  if (lowMem) {
    outCanvas.width = 0; outCanvas.height = 0;
    // iPhone: the WebView was killed at the save step while the model was still
    // resident (measured 09-29). Free it now; the next run reloads from cache.
    if (cached) {
      try { await (cached.pipeline as unknown as { dispose?: () => Promise<void> | void }).dispose?.(); } catch { /* */ }
      cached = null;
    }
  }
  opts.onProgress?.({ phase: 'Done', ratio: 1 });
  return out;
}
