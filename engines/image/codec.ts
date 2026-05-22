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
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bm.width, bm.height)
        : Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height });
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      ctx.drawImage(bm, 0, 0);
      data = (ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).getImageData(0, 0, bm.width, bm.height);
      bm.close();
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

  let buf: ArrayBuffer;
  switch (format) {
    case 'jpeg': {
      const m = await import('@jsquash/jpeg');
      buf = await m.encode(data, { quality: q });
      break;
    }
    case 'png': {
      const m = await import('@jsquash/png');
      buf = await m.encode(data);
      break;
    }
    case 'webp': {
      const m = await import('@jsquash/webp');
      buf = await m.encode(data, {
        quality: q,
        method: Math.max(0, Math.min(6, opts.effort ?? 4)),
      });
      break;
    }
    case 'avif': {
      const m = await import('@jsquash/avif');
      buf = await m.encode(data, {
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
