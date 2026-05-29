/**
 * Image codec layer. Decodes any common format → raw RGBA `ImageData`,
 * encodes `ImageData` → bytes in any target format.
 *
 * Each codec is lazy-loaded so the bundle only ships the formats actually used
 * by the tool that's open.
 */

import { detectFormat } from './format';
import type { EncodeOptions, ImageFormat } from './types';
import { FORMAT_TO_MIME } from './types';
import { stampImageData } from './watermark';
import { BRAND_DOMAIN } from '@/lib/brand';

/**
 * Brand watermark applied to EVERY encoded image (this is the single chokepoint —
 * main thread and both compute workers all encode through encodeLocal). Defaults to
 * ON (free); the app calls setWatermark(null) only once a Pro/Team session is
 * confirmed (main thread via WatermarkInit, workers via the __wmInit message). The
 * free-default means an image is never accidentally shipped UNbranded.
 */
let _wmText: string | null = BRAND_DOMAIN;
export function setWatermark(text: string | null): void { _wmText = text; }

export interface DecodeResult {
  data: ImageData;
  format: ImageFormat | 'bitmap';
  ms: number;
}

// Route to the codec worker when called on the MAIN thread, so the synchronous
// WASM codecs never block the UI. Inside a worker (no `window`) we run directly.
const offThread = typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

export async function decode(blob: Blob): Promise<DecodeResult> {
  if (offThread) {
    const { codecDecode } = await import('@/lib/compute/codecClient');
    return codecDecode(blob);
  }
  return decodeLocal(blob);
}

export async function decodeLocal(blob: Blob): Promise<DecodeResult> {
  const t0 = performance.now();
  const fmt = await detectFormat(blob);
  const buf = await blob.arrayBuffer();

  let data: ImageData;
  let format: ImageFormat | 'bitmap' = fmt ?? 'bitmap';

  switch (fmt) {
    case 'jpeg': {
      const m = await import('@jsquash/jpeg');
      data = await m.decode(buf);
      break;
    }
    case 'png': {
      const m = await import('@jsquash/png');
      data = await m.decode(buf);
      break;
    }
    case 'webp': {
      const m = await import('@jsquash/webp');
      data = await m.decode(buf);
      break;
    }
    case 'avif': {
      const m = await import('@jsquash/avif');
      const decoded = await m.decode(buf);
      if (!decoded) throw new Error('Failed to decode AVIF image');
      data = decoded;
      break;
    }
    default: {
      // Fall back to platform decoder (handles GIF, BMP, TIFF, SVG-rasterized, etc.)
      const bm = await createImageBitmap(blob);
      try {
        const canvas = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(bm.width, bm.height)
          : Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height });
        const ctx = canvas.getContext('2d') as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D
          | null;
        if (!ctx) throw new Error('Canvas 2D unavailable');
        ctx.drawImage(bm, 0, 0);
        data = ctx.getImageData(0, 0, bm.width, bm.height);
      } finally {
        // Always release the bitmap — getImageData can throw on a tainted
        // canvas or hit a browser bug, leaking the bitmap until GC.
        try { bm.close(); } catch { /* */ }
      }
      format = 'bitmap';
    }
  }

  return { data, format, ms: performance.now() - t0 };
}

export interface EncodeResult {
  blob: Blob;
  bytes: number;
  ms: number;
}

export async function encode(
  data: ImageData,
  format: ImageFormat,
  opts: EncodeOptions = {},
): Promise<EncodeResult> {
  if (offThread) {
    const { codecEncode } = await import('@/lib/compute/codecClient');
    return codecEncode(data, format, opts);
  }
  return encodeLocal(data, format, opts);
}

export async function encodeLocal(
  data: ImageData,
  format: ImageFormat,
  opts: EncodeOptions = {},
): Promise<EncodeResult> {
  const t0 = performance.now();
  const q = opts.quality ?? 90;
  // Brand stamp (free) — applied here so every encode path is covered. Pro →
  // setWatermark(null) makes this a no-op. Stamping is itself crash-safe.
  const src = _wmText ? stampImageData(data, _wmText) : data;

  let buf: ArrayBuffer;
  switch (format) {
    case 'jpeg': {
      const m = await import('@jsquash/jpeg');
      buf = await m.encode(src, { quality: q });
      break;
    }
    case 'png': {
      const m = await import('@jsquash/png');
      buf = await m.encode(src);
      break;
    }
    case 'webp': {
      const m = await import('@jsquash/webp');
      buf = await m.encode(src, {
        quality: q,
        method: Math.max(0, Math.min(6, opts.effort ?? 4)),
      });
      break;
    }
    case 'avif': {
      const m = await import('@jsquash/avif');
      buf = await m.encode(src, {
        quality: q,
        speed: Math.max(0, Math.min(10, 10 - (opts.effort ?? 6))),
        lossless: opts.lossless ?? false,
      });
      break;
    }
  }

  const blob = new Blob([buf], { type: FORMAT_TO_MIME[format] });
  return { blob, bytes: blob.size, ms: performance.now() - t0 };
}
