/**
 * 3D LUT (.cube) support — DaVinci/Premiere-grade color transform.
 *
 * Parses Adobe/IRIDAS .cube files into a 3D lookup table and applies it to RGBA
 * pixel data with trilinear interpolation. Used by video + image studios so a
 * single creative LUT can colour-grade a whole clip/photo exactly like a film
 * emulation or a downloaded look. Same code runs in preview AND export so the
 * graded frame is identical (the WYSIWYG guarantee).
 */

export interface Lut3D {
  size: number;            // N (per-axis sample count, e.g. 33)
  /** Flattened RGB triplets, indexed as ((b*N + g)*N + r)*3 — the .cube order
   *  where RED changes fastest. Values 0..1. */
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  title?: string;
}

/** Parse a .cube LUT (1D or 3D). Returns null if not a valid 3D cube. */
export function parseCubeLut(text: string): Lut3D | null {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  let title: string | undefined;
  const triplets: number[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) { title = line.replace(/^TITLE\s+/i, '').replace(/^"|"$/g, ''); continue; }
    if (upper.startsWith('LUT_3D_SIZE')) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (upper.startsWith('LUT_1D_SIZE')) { return null; } // 1D not supported here
    if (upper.startsWith('DOMAIN_MIN')) { const p = line.split(/\s+/); domainMin = [+p[1], +p[2], +p[3]]; continue; }
    if (upper.startsWith('DOMAIN_MAX')) { const p = line.split(/\s+/); domainMax = [+p[1], +p[2], +p[3]]; continue; }
    if (/^[-\d.eE]/.test(line)) {
      const p = line.split(/\s+/).map(Number);
      if (p.length >= 3 && p.every(n => isFinite(n))) { triplets.push(p[0], p[1], p[2]); }
    }
  }
  if (!size || triplets.length !== size * size * size * 3) return null;
  return { size, data: new Float32Array(triplets), domainMin, domainMax, title };
}

/** Sample the LUT at normalized (r,g,b) in 0..1 with trilinear interpolation.
 *  Writes the result into out[0..2] (0..1). */
function sampleLut(lut: Lut3D, r: number, g: number, b: number, out: Float32Array): void {
  const N = lut.size, d = lut.data;
  const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
  const fr = clamp01(r) * (N - 1), fg = clamp01(g) * (N - 1), fb = clamp01(b) * (N - 1);
  const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, N - 1), g1 = Math.min(g0 + 1, N - 1), b1 = Math.min(b0 + 1, N - 1);
  const dr = fr - r0, dg = fg - g0, db = fb - b0;
  // index helper — RED fastest (.cube convention)
  const idx = (ri: number, gi: number, bi: number) => ((bi * N + gi) * N + ri) * 3;
  // 8 corners, trilinear blend, per channel
  for (let c = 0; c < 3; c++) {
    const c000 = d[idx(r0, g0, b0) + c], c100 = d[idx(r1, g0, b0) + c];
    const c010 = d[idx(r0, g1, b0) + c], c110 = d[idx(r1, g1, b0) + c];
    const c001 = d[idx(r0, g0, b1) + c], c101 = d[idx(r1, g0, b1) + c];
    const c011 = d[idx(r0, g1, b1) + c], c111 = d[idx(r1, g1, b1) + c];
    const c00 = c000 * (1 - dr) + c100 * dr, c10 = c010 * (1 - dr) + c110 * dr;
    const c01 = c001 * (1 - dr) + c101 * dr, c11 = c011 * (1 - dr) + c111 * dr;
    const c0 = c00 * (1 - dg) + c10 * dg, c1 = c01 * (1 - dg) + c11 * dg;
    out[c] = c0 * (1 - db) + c1 * db;
  }
}

/**
 * Apply a 3D LUT to RGBA pixel data in place. `intensity` 0..1 blends between
 * the original and the LUT-mapped colour (so a look can be dialed down).
 */
export function applyLut(data: Uint8ClampedArray, lut: Lut3D, intensity = 1): void {
  const out = new Float32Array(3);
  const amt = Math.max(0, Math.min(1, intensity));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    sampleLut(lut, r, g, b, out);
    data[i] = (r * (1 - amt) + out[0] * amt) * 255;
    data[i + 1] = (g * (1 - amt) + out[1] * amt) * 255;
    data[i + 2] = (b * (1 - amt) + out[2] * amt) * 255;
  }
}
