/**
 * Pure pixel filters. Each function takes an ImageData and options, returns a
 * brand-new ImageData (input is never mutated, so the caller can keep the
 * original around for compare sliders without re-decoding).
 */

function clone(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

function clamp(v: number, lo = 0, hi = 255): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function grayscale(src: ImageData, opts: { amount?: number } = {}): ImageData {
  const out = clone(src);
  const a = (opts.amount ?? 100) / 100;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    // Rec. 709 luma — perceptually accurate.
    const gray = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i]     = d[i]     + (gray - d[i])     * a;
    d[i + 1] = d[i + 1] + (gray - d[i + 1]) * a;
    d[i + 2] = d[i + 2] + (gray - d[i + 2]) * a;
  }
  return out;
}

export function invert(src: ImageData, opts: { amount?: number } = {}): ImageData {
  const out = clone(src);
  const a = (opts.amount ?? 100) / 100;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = d[i]     + ((255 - d[i])     * a) - d[i]     * a;
    d[i + 1] = d[i + 1] + ((255 - d[i + 1]) * a) - d[i + 1] * a;
    d[i + 2] = d[i + 2] + ((255 - d[i + 2]) * a) - d[i + 2] * a;
  }
  return out;
}

export function sepia(src: ImageData, opts: { amount?: number } = {}): ImageData {
  const out = clone(src);
  const a = (opts.amount ?? 100) / 100;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const tr = 0.393 * r + 0.769 * g + 0.189 * b;
    const tg = 0.349 * r + 0.686 * g + 0.168 * b;
    const tb = 0.272 * r + 0.534 * g + 0.131 * b;
    d[i]     = clamp(r + (tr - r) * a);
    d[i + 1] = clamp(g + (tg - g) * a);
    d[i + 2] = clamp(b + (tb - b) * a);
  }
  return out;
}

/** value: -100..+100 (0 = no change) */
export function brightness(src: ImageData, opts: { value?: number } = {}): ImageData {
  const out = clone(src);
  const adj = ((opts.value ?? 0) / 100) * 255;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp(d[i]     + adj);
    d[i + 1] = clamp(d[i + 1] + adj);
    d[i + 2] = clamp(d[i + 2] + adj);
  }
  return out;
}

/** value: -100..+100 (0 = no change) */
export function contrast(src: ImageData, opts: { value?: number } = {}): ImageData {
  const out = clone(src);
  const v = opts.value ?? 0;
  const factor = (259 * (v + 255)) / (255 * (259 - v));
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp(factor * (d[i]     - 128) + 128);
    d[i + 1] = clamp(factor * (d[i + 1] - 128) + 128);
    d[i + 2] = clamp(factor * (d[i + 2] - 128) + 128);
  }
  return out;
}

/** value: -100..+100. Negative desaturates; positive boosts. */
export function saturation(src: ImageData, opts: { value?: number } = {}): ImageData {
  const out = clone(src);
  const s = 1 + (opts.value ?? 0) / 100;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    d[i]     = clamp(gray + (r - gray) * s);
    d[i + 1] = clamp(gray + (g - gray) * s);
    d[i + 2] = clamp(gray + (b - gray) * s);
  }
  return out;
}

/** angle: -180..+180 degrees */
export function hue(src: ImageData, opts: { angle?: number } = {}): ImageData {
  const out = clone(src);
  const angle = ((opts.angle ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  // YIQ rotation matrix — fast hue shift without full HSL roundtrip.
  const m00 = 0.299 + 0.701 * cosA + 0.168 * sinA;
  const m01 = 0.587 - 0.587 * cosA + 0.330 * sinA;
  const m02 = 0.114 - 0.114 * cosA - 0.497 * sinA;
  const m10 = 0.299 - 0.299 * cosA - 0.328 * sinA;
  const m11 = 0.587 + 0.413 * cosA + 0.035 * sinA;
  const m12 = 0.114 - 0.114 * cosA + 0.292 * sinA;
  const m20 = 0.299 - 0.300 * cosA + 1.250 * sinA;
  const m21 = 0.587 - 0.588 * cosA - 1.050 * sinA;
  const m22 = 0.114 + 0.886 * cosA - 0.203 * sinA;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = clamp(r * m00 + g * m01 + b * m02);
    d[i + 1] = clamp(r * m10 + g * m11 + b * m12);
    d[i + 2] = clamp(r * m20 + g * m21 + b * m22);
  }
  return out;
}

/** value: 0.1..5 (1 = no change) */
export function gamma(src: ImageData, opts: { value?: number } = {}): ImageData {
  const out = clone(src);
  const g = 1 / Math.max(0.01, opts.value ?? 1);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp(255 * Math.pow(i / 255, g));
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  return out;
}

export function threshold(src: ImageData, opts: { value?: number } = {}): ImageData {
  const out = clone(src);
  const t = opts.value ?? 128;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const v = luma >= t ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return out;
}

/** Combined vintage look — desaturate + sepia tint + warm shift + slight vignette feel. */
export function vintage(src: ImageData, opts: { amount?: number } = {}): ImageData {
  const a = (opts.amount ?? 100) / 100;
  let work = saturation(src, { value: -30 * a });
  work = sepia(work, { amount: 40 * a });
  work = contrast(work, { value: 10 * a });
  return work;
}

/**
 * 3×3 convolution helper. Uses edge-clamped sampling so borders stay clean.
 * Kept generic so the caller can pass sharpen / emboss / edge-detect kernels.
 */
export function convolve3x3(src: ImageData, kernel: number[], divisor = 1, bias = 0): ImageData {
  if (kernel.length !== 9) throw new Error('convolve3x3 expects a 9-element kernel');
  const w = src.width, h = src.height;
  const out = new ImageData(w, h);
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const sy = Math.min(h - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(w - 1, Math.max(0, x + kx));
          const i = (sy * w + sx) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          r += sd[i] * k;
          g += sd[i + 1] * k;
          b += sd[i + 2] * k;
        }
      }
      const oi = (y * w + x) * 4;
      od[oi]     = clamp(r / divisor + bias);
      od[oi + 1] = clamp(g / divisor + bias);
      od[oi + 2] = clamp(b / divisor + bias);
      od[oi + 3] = sd[oi + 3];
    }
  }
  return out;
}

export function sharpen(src: ImageData, opts: { amount?: number } = {}): ImageData {
  const a = (opts.amount ?? 100) / 100;
  // Unsharp 3x3 kernel scaled by amount, center weight stays 1+4a so it's a no-op at 0.
  const kernel = [
    0,       -a, 0,
    -a,  1 + 4 * a, -a,
    0,       -a, 0,
  ];
  return convolve3x3(src, kernel);
}

export function emboss(src: ImageData): ImageData {
  return convolve3x3(src, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 128);
}

export function edge(src: ImageData): ImageData {
  return convolve3x3(src, [-1, -1, -1, -1, 8, -1, -1, -1, -1]);
}
