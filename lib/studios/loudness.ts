/**
 * Offline ITU-R BS.1770 integrated loudness (LUFS) + loudness normalization.
 *
 * Both Music and Voice studios claimed "broadcast loudness" / "-16 LUFS" but
 * actually normalized by PEAK or RMS, which is not loudness at all — two files
 * peak-matched to the same dBFS can differ 10+ LU in perceived loudness. This
 * module measures real K-weighted, gated, channel-summed integrated loudness
 * per BS.1770-4 and provides a normalize-to-target that also respects a
 * true-peak-ish ceiling so the output is broadcast-safe and HONEST.
 *
 * Pure functions on Float32 channel arrays — no Web Audio, testable in Node,
 * shared by Music (master bounce) and Voice (broadcast chain / normalize-on-
 * export). For the realtime meter see lufs-meter.ts.
 */

// --- BS.1770 "K" pre-filter: a high-shelf (stage 1) then a high-pass (stage 2),
// applied per channel before the mean-square energy measurement. Coefficients
// are the standard 48 kHz reference; we re-derive both biquads for the actual
// sample rate so 44.1 kHz material is measured correctly too.

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function applyBiquad(x: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = c.b0 * xn + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    out[i] = yn;
  }
  return out;
}

/** Stage 1 high-shelf (~+4 dB above ~1.5 kHz) — head/torso model. */
function kShelf(sampleRate: number): Biquad {
  // RBJ high-shelf, fc≈1681.97 Hz, gain≈+3.999 dB, Q≈0.7071 (BS.1770 reference).
  const fc = 1681.974450955533, gainDb = 3.999843853973347, Q = 0.7071752369554196;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * Q);
  const sq = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cos + sq);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cos);
  const b2 = A * ((A + 1) + (A - 1) * cos - sq);
  const a0 = (A + 1) - (A - 1) * cos + sq;
  const a1 = 2 * ((A - 1) - (A + 1) * cos);
  const a2 = (A + 1) - (A - 1) * cos - sq;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Stage 2 high-pass (~38 Hz) — removes rumble that doesn't carry loudness. */
function kHighpass(sampleRate: number): Biquad {
  const fc = 38.13547087602444, Q = 0.5003270373238773;
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * Q);
  const b0 = (1 + cos) / 2, b1 = -(1 + cos), b2 = (1 + cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function kWeight(x: Float32Array, sampleRate: number): Float32Array {
  return applyBiquad(applyBiquad(x, kShelf(sampleRate)), kHighpass(sampleRate));
}

// Per-channel weights for the channel-summed loudness (BS.1770: L/R = 1.0).
const CHANNEL_WEIGHTS = [1.0, 1.0, 1.0, 1.41, 1.41]; // L, R, C, Ls, Rs

/**
 * Integrated loudness in LUFS with the BS.1770 two-stage gate (absolute −70 LUFS
 * gate, then relative −10 LU gate). `channels` = array of Float32 sample arrays.
 */
export function measureIntegratedLufs(channels: Float32Array[], sampleRate: number): number {
  if (!channels.length || channels[0].length === 0) return -Infinity;
  const weighted = channels.map((c) => kWeight(c, sampleRate));
  // 400 ms blocks, 75% overlap (100 ms hop).
  const blockLen = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const n = weighted[0].length;
  if (n < blockLen) return -Infinity;
  const blockLoudness: number[] = [];
  for (let start = 0; start + blockLen <= n; start += hop) {
    let sum = 0;
    for (let ch = 0; ch < weighted.length; ch++) {
      const w = CHANNEL_WEIGHTS[ch] ?? 1.0;
      const d = weighted[ch];
      let ms = 0;
      for (let i = 0; i < blockLen; i++) { const v = d[start + i]; ms += v * v; }
      sum += w * (ms / blockLen);
    }
    blockLoudness.push(-0.691 + 10 * Math.log10(sum + 1e-12));
  }
  if (!blockLoudness.length) return -Infinity;
  // Absolute gate at −70 LUFS.
  const absGated = blockLoudness.filter((l) => l > -70);
  if (!absGated.length) return -Infinity;
  // Relative gate: mean of abs-gated minus 10 LU.
  const meanAbs = energyMean(absGated);
  const relThresh = meanAbs - 10;
  const relGated = absGated.filter((l) => l > relThresh);
  if (!relGated.length) return meanAbs;
  return energyMean(relGated);
}

/** Mean in the energy domain (loudness values must be averaged as powers). */
function energyMean(lufs: number[]): number {
  let sum = 0;
  for (const l of lufs) sum += Math.pow(10, (l + 0.691) / 10);
  return -0.691 + 10 * Math.log10(sum / lufs.length + 1e-12);
}

/** Oversampled-ish true-peak estimate (dBTP) — 4× linear interpolation. */
export function measureTruePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const d of channels) {
    for (let i = 0; i < d.length - 1; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      // inter-sample peaks via 4× linear interp (cheap, catches most overs).
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const v = Math.abs(d[i] * (1 - t) + d[i + 1] * t);
        if (v > peak) peak = v;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

export interface LoudnessNormResult {
  channels: Float32Array[];
  /** Measured loudness BEFORE normalization. */
  inputLufs: number;
  /** Gain applied, in dB. */
  gainDb: number;
  /** Whether the true-peak ceiling clamped the gain. */
  peakLimited: boolean;
}

/**
 * Normalize to `targetLufs` (e.g. −16 streaming, −23 EBU R128 broadcast),
 * limited so the result never exceeds `truePeakCeilingDb` (default −1 dBTP).
 * Returns NEW channel arrays. This is what an honest "Normalize to −16 LUFS /
 * Broadcast-safe" control does — not peak/RMS.
 */
export function normalizeLoudness(
  channels: Float32Array[], sampleRate: number,
  targetLufs = -16, truePeakCeilingDb = -1,
): LoudnessNormResult {
  const inputLufs = measureIntegratedLufs(channels, sampleRate);
  if (!isFinite(inputLufs)) {
    return { channels: channels.map((c) => Float32Array.from(c)), inputLufs, gainDb: 0, peakLimited: false };
  }
  let gainDb = targetLufs - inputLufs;
  // Don't let the loudness gain push true-peak past the ceiling.
  const tp = measureTruePeakDb(channels);
  let peakLimited = false;
  if (isFinite(tp) && tp + gainDb > truePeakCeilingDb) {
    gainDb = truePeakCeilingDb - tp;
    peakLimited = true;
  }
  const lin = Math.pow(10, gainDb / 20);
  const out = channels.map((c) => {
    const o = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const v = c[i] * lin;
      o[i] = v < -1 ? -1 : v > 1 ? 1 : v;
    }
    return o;
  });
  return { channels: out, inputLufs, gainDb, peakLimited };
}
