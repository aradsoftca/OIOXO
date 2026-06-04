export interface ColorWheelOffset {
  r: number;
  g: number;
  b: number;
  master: number;
}

export interface ColorWheels {
  shadows: ColorWheelOffset;
  midtones: ColorWheelOffset;
  highlights: ColorWheelOffset;
}

export const ZERO_OFFSET: ColorWheelOffset = { r: 0, g: 0, b: 0, master: 0 };

export const ZERO_WHEELS: ColorWheels = {
  shadows: { ...ZERO_OFFSET },
  midtones: { ...ZERO_OFFSET },
  highlights: { ...ZERO_OFFSET },
};

function shadowWeight(luma: number): number {
  if (luma >= 0.5) return 0;
  return (1 - luma * 2) ** 1.5;
}

function highlightWeight(luma: number): number {
  if (luma <= 0.5) return 0;
  return ((luma - 0.5) * 2) ** 1.5;
}

function midtoneWeight(luma: number): number {
  return 1 - Math.abs(luma - 0.5) * 2;
}

export function isZeroWheels(w: ColorWheels): boolean {
  for (const region of ['shadows', 'midtones', 'highlights'] as const) {
    const o = w[region];
    if (o.r !== 0 || o.g !== 0 || o.b !== 0 || o.master !== 0) return false;
  }
  return true;
}

export function applyColorWheelsToImageData(data: Uint8ClampedArray, w: ColorWheels): void {
  if (isZeroWheels(w)) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const ws = shadowWeight(luma);
    const wm = midtoneWeight(luma);
    const wh = highlightWeight(luma);
    const offR = (w.shadows.r * ws + w.midtones.r * wm + w.highlights.r * wh) / 255;
    const offG = (w.shadows.g * ws + w.midtones.g * wm + w.highlights.g * wh) / 255;
    const offB = (w.shadows.b * ws + w.midtones.b * wm + w.highlights.b * wh) / 255;
    const master = (w.shadows.master * ws + w.midtones.master * wm + w.highlights.master * wh) / 255;
    let outR = r + offR + master;
    let outG = g + offG + master;
    let outB = b + offB + master;
    data[i] = Math.max(0, Math.min(255, outR * 255));
    data[i + 1] = Math.max(0, Math.min(255, outG * 255));
    data[i + 2] = Math.max(0, Math.min(255, outB * 255));
  }
}

export interface RgbCurve {
  points: { x: number; y: number }[];
}

export interface CurveSet {
  master?: RgbCurve;
  r?: RgbCurve;
  g?: RgbCurve;
  b?: RgbCurve;
}

export function applyCurveSet(data: Uint8ClampedArray, set: CurveSet): void {
  const masterLut = set.master ? buildLut(set.master.points) : null;
  const rLut = set.r ? buildLut(set.r.points) : null;
  const gLut = set.g ? buildLut(set.g.points) : null;
  const bLut = set.b ? buildLut(set.b.points) : null;
  if (!masterLut && !rLut && !gLut && !bLut) return;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (rLut) r = rLut[r];
    if (gLut) g = gLut[g];
    if (bLut) b = bLut[b];
    if (masterLut) {
      r = masterLut[r];
      g = masterLut[g];
      b = masterLut[b];
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

export function buildLut(points: { x: number; y: number }[]): Uint8ClampedArray {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  for (let x = 0; x < 256; x++) {
    let p0 = sorted[0];
    let p1 = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (x >= sorted[i].x && x <= sorted[i + 1].x) {
        p0 = sorted[i];
        p1 = sorted[i + 1];
        break;
      }
    }
    const span = p1.x - p0.x;
    const t = span === 0 ? 0 : (x - p0.x) / span;
    const eased = smoothstep(t);
    lut[x] = Math.max(0, Math.min(255, p0.y + (p1.y - p0.y) * eased));
  }
  return lut;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export const IDENTITY_CURVE: RgbCurve = {
  points: [
    { x: 0, y: 0 },
    { x: 64, y: 64 },
    { x: 128, y: 128 },
    { x: 192, y: 192 },
    { x: 255, y: 255 },
  ],
};
