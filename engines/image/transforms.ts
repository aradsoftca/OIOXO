/**
 * Geometric image transforms. Each returns a brand-new ImageData; input is
 * untouched so the caller can keep the original around.
 */

export function flip(src: ImageData, opts: { horizontal?: boolean; vertical?: boolean }): ImageData {
  const { horizontal = false, vertical = false } = opts;
  const w = src.width, h = src.height;
  const out = new ImageData(w, h);
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    const sy = vertical ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? w - 1 - x : x;
      const si = (sy * w + sx) * 4;
      const oi = (y * w + x) * 4;
      od[oi]     = sd[si];
      od[oi + 1] = sd[si + 1];
      od[oi + 2] = sd[si + 2];
      od[oi + 3] = sd[si + 3];
    }
  }
  return out;
}

/** Rotate by an arbitrary angle (degrees). Output canvas grows to fit. */
export function rotate(
  src: ImageData,
  opts: { angle: number; background?: string },
): ImageData {
  const angle = ((opts.angle % 360) + 360) % 360;
  // Fast paths for 90° multiples — exact pixel mapping, no resample.
  if (angle === 0) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  if (angle === 90 || angle === 180 || angle === 270) return rotate90(src, angle);

  // Generic case via canvas to use bilinear sampling and proper alpha.
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const outW = Math.round(src.width * cos + src.height * sin);
  const outH = Math.round(src.width * sin + src.height * cos);

  const inCanvas = makeCanvas(src.width, src.height);
  const inCtx = inCanvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!inCtx) throw new Error('Canvas 2D unavailable');
  inCtx.putImageData(src, 0, 0);

  const outCanvas = makeCanvas(outW, outH);
  const outCtx = outCanvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!outCtx) throw new Error('Canvas 2D unavailable');
  if (opts.background) {
    outCtx.fillStyle = opts.background;
    outCtx.fillRect(0, 0, outW, outH);
  }
  outCtx.translate(outW / 2, outH / 2);
  outCtx.rotate((angle * Math.PI) / 180);
  outCtx.drawImage(inCanvas as unknown as CanvasImageSource, -src.width / 2, -src.height / 2);
  return outCtx.getImageData(0, 0, outW, outH);
}

function rotate90(src: ImageData, angle: 90 | 180 | 270 | number): ImageData {
  const w = src.width, h = src.height;
  if (angle === 180) {
    const out = new ImageData(w, h);
    const sd = src.data, od = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((h - 1 - y) * w + (w - 1 - x)) * 4;
        const oi = (y * w + x) * 4;
        od[oi]     = sd[si];
        od[oi + 1] = sd[si + 1];
        od[oi + 2] = sd[si + 2];
        od[oi + 3] = sd[si + 3];
      }
    }
    return out;
  }
  // 90° or 270° — output is swapped dimensions.
  const out = new ImageData(h, w);
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const oi = angle === 90
        ? (x * h + (h - 1 - y)) * 4
        : ((w - 1 - x) * h + y) * 4;
      const si = (y * w + x) * 4;
      od[oi]     = sd[si];
      od[oi + 1] = sd[si + 1];
      od[oi + 2] = sd[si + 2];
      od[oi + 3] = sd[si + 3];
    }
  }
  return out;
}

export function crop(
  src: ImageData,
  opts: { x: number; y: number; width: number; height: number },
): ImageData {
  const sx = Math.max(0, Math.min(src.width  - 1, Math.round(opts.x)));
  const sy = Math.max(0, Math.min(src.height - 1, Math.round(opts.y)));
  const w  = Math.max(1, Math.min(src.width  - sx, Math.round(opts.width)));
  const h  = Math.max(1, Math.min(src.height - sy, Math.round(opts.height)));
  const out = new ImageData(w, h);
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    const sRow = ((sy + y) * src.width + sx) * 4;
    const oRow = y * w * 4;
    od.set(sd.subarray(sRow, sRow + w * 4), oRow);
  }
  return out;
}

/** Pixelate by averaging blocks of `size` × `size` pixels. */
export function pixelate(src: ImageData, opts: { size: number }): ImageData {
  const size = Math.max(2, Math.min(128, Math.round(opts.size)));
  const w = src.width, h = src.height;
  const out = new ImageData(w, h);
  const sd = src.data, od = out.data;
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      const bw = Math.min(size, w - bx);
      const bh = Math.min(size, h - by);
      // Average over the block
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = 0; y < bh; y++) {
        const row = ((by + y) * w + bx) * 4;
        for (let x = 0; x < bw; x++) {
          const i = row + x * 4;
          r += sd[i]; g += sd[i + 1]; b += sd[i + 2]; a += sd[i + 3]; n++;
        }
      }
      r = r / n; g = g / n; b = b / n; a = a / n;
      for (let y = 0; y < bh; y++) {
        const row = ((by + y) * w + bx) * 4;
        for (let x = 0; x < bw; x++) {
          const i = row + x * 4;
          od[i]     = r;
          od[i + 1] = g;
          od[i + 2] = b;
          od[i + 3] = a;
        }
      }
    }
  }
  return out;
}

export function vignette(
  src: ImageData,
  opts: { strength?: number; radius?: number; color?: [number, number, number] } = {},
): ImageData {
  const s = (opts.strength ?? 60) / 100;
  const r = opts.radius ?? 0.85;
  const [cr, cg, cb] = opts.color ?? [0, 0, 0];
  const w = src.width, h = src.height;
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      // Smoothstep falloff past r
      const t = Math.max(0, (dist - r) / (1 - r));
      const k = s * t * t * (3 - 2 * t);
      const i = (y * w + x) * 4;
      d[i]     = d[i]     + (cr - d[i])     * k;
      d[i + 1] = d[i + 1] + (cg - d[i + 1]) * k;
      d[i + 2] = d[i + 2] + (cb - d[i + 2]) * k;
    }
  }
  // dummy use of maxDist to silence unused warnings in case we adjust math
  void maxDist;
  return out;
}

/**
 * Gaussian blur via the canvas `filter` (GPU-accelerated in Chromium/Safari).
 * Returns RGBA at the same dimensions. `blurPx` is the standard-deviation
 * radius in pixels; 0 is a no-op passthrough copy.
 */
export function blur(src: ImageData, opts: { blurPx?: number }): ImageData {
  const px = Math.max(0, opts.blurPx ?? 0);
  if (px === 0) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const srcCanvas = makeCanvas(src.width, src.height);
  get2d(srcCanvas).putImageData(src, 0, 0);
  const out = makeCanvas(src.width, src.height);
  const octx = get2d(out);
  octx.filter = `blur(${px}px)`;
  octx.drawImage(srcCanvas as CanvasImageSource, 0, 0);
  return octx.getImageData(0, 0, src.width, src.height);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2d(canvas: HTMLCanvasElement | OffscreenCanvas):
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return ctx;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Add a solid-color border around the image. Output is larger than input. */
export function border(
  src: ImageData,
  opts: { width: number; color: string },
): ImageData {
  // Cap border width so a UI slider bug (or hostile params over the worker
  // message channel) can't request a 200_000 px border and crash the tab
  // attempting a multi-GB ImageData allocation. 4096 is far more than any
  // sensible border use case.
  const w = Math.max(0, Math.min(4096, Math.round(opts.width)));
  const [r, g, b] = hexToRgb(opts.color);
  const outW = src.width + w * 2;
  const outH = src.height + w * 2;
  const out = new ImageData(outW, outH);
  const od = out.data;

  // Fill with border color
  for (let i = 0; i < od.length; i += 4) {
    od[i] = r; od[i + 1] = g; od[i + 2] = b; od[i + 3] = 255;
  }
  // Paste source pixels
  const sd = src.data;
  for (let y = 0; y < src.height; y++) {
    const sRow = y * src.width * 4;
    const oRow = ((y + w) * outW + w) * 4;
    od.set(sd.subarray(sRow, sRow + src.width * 4), oRow);
  }
  return out;
}

/**
 * Mask out corners with a rounded-rect alpha cutout. Returns RGBA — encode as PNG/WebP
 * to keep transparency. JPEG output will composite onto black.
 */
export function roundCorners(
  src: ImageData,
  opts: { radius: number },
): ImageData {
  const radius = Math.max(0, Math.min(Math.floor(Math.min(src.width, src.height) / 2), Math.round(opts.radius)));
  if (radius === 0) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);

  const canvas = makeCanvas(src.width, src.height);
  const ctx = get2d(canvas);
  ctx.putImageData(src, 0, 0);

  // Build a rounded-rect mask using composite operations.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  const x = 0, y = 0, w = src.width, h = src.height, r = radius;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  return ctx.getImageData(0, 0, src.width, src.height);
}
