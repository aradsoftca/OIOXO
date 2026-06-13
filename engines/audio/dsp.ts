/**
 * Audio DSP primitives — pure functions on raw sample arrays (Float32Array),
 * with no Web Audio dependency, so they can be unit-tested in Node and reused by
 * the AudioBuffer wrappers in index.ts.
 *
 * Implements the well-defined building blocks behind the bass/treble/echo/reverb
 * tools: RBJ "Audio EQ Cookbook" shelving biquads, a feedback delay, and a
 * compact Schroeder/Freeverb-style reverb. We deliberately only add effects we
 * can implement correctly — pitch/tempo (which need a phase vocoder) are not
 * here, so we never ship an effect that doesn't actually do what it claims.
 */

/**
 * RBJ shelving biquad (slope S = 1). `type` is the shelf end being boosted/cut,
 * `freq` the corner frequency, `gainDb` the boost (+) or cut (−). At 0 dB it is
 * an identity filter. Returns a new array; input is untouched.
 */
export function shelf(x: Float32Array, sampleRate: number, type: 'low' | 'high', freq: number, gainDb: number): Float32Array {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.SQRT2; // S = 1 ⇒ sqrt((A+1/A)(1/S−1)+2) = sqrt(2)
  const sqrtA2 = 2 * Math.sqrt(A) * alpha;
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'low') {
    b0 = A * ((A + 1) - (A - 1) * cos + sqrtA2);
    b1 = 2 * A * ((A - 1) - (A + 1) * cos);
    b2 = A * ((A + 1) - (A - 1) * cos - sqrtA2);
    a0 = (A + 1) + (A - 1) * cos + sqrtA2;
    a1 = -2 * ((A - 1) + (A + 1) * cos);
    a2 = (A + 1) + (A - 1) * cos - sqrtA2;
  } else {
    b0 = A * ((A + 1) + (A - 1) * cos + sqrtA2);
    b1 = -2 * A * ((A - 1) + (A + 1) * cos);
    b2 = A * ((A + 1) + (A - 1) * cos - sqrtA2);
    a0 = (A + 1) - (A - 1) * cos + sqrtA2;
    a1 = 2 * ((A - 1) - (A + 1) * cos);
    a2 = (A + 1) - (A - 1) * cos - sqrtA2;
  }
  const cb0 = b0 / a0, cb1 = b1 / a0, cb2 = b2 / a0, ca1 = a1 / a0, ca2 = a2 / a0;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = cb0 * xn + cb1 * x1 + cb2 * x2 - ca1 * y1 - ca2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    out[i] = yn;
  }
  return out;
}

/**
 * RBJ peaking (bell) EQ biquad — boosts/cuts a band around `freq` with bandwidth
 * set by `q`. Used for the 3-band EQ's MID band (the shelves cover bass/treble).
 * At 0 dB it is identity. Returns a new array; input untouched.
 */
export function peaking(x: Float32Array, sampleRate: number, freq: number, gainDb: number, q = 1): Float32Array {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / A;
  const cb0 = b0 / a0, cb1 = b1 / a0, cb2 = b2 / a0, ca1 = a1 / a0, ca2 = a2 / a0;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = cb0 * xn + cb1 * x1 + cb2 * x2 - ca1 * y1 - ca2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    out[i] = yn;
  }
  return out;
}

/** Feedback echo: each repeat is `decay` of the previous, `delaySec` apart. */
export function echo(x: Float32Array, sampleRate: number, delaySec: number, decay: number): Float32Array {
  const d = Math.max(1, Math.round(delaySec * sampleRate));
  const out = Float32Array.from(x);
  for (let i = d; i < out.length; i++) out[i] += decay * out[i - d];
  return out;
}

// --- Schroeder/Freeverb-style reverb ---------------------------------------

function combFilter(x: Float32Array, delay: number, feedback: number, damp: number): Float32Array {
  const buf = new Float32Array(delay);
  const out = new Float32Array(x.length);
  let idx = 0, store = 0;
  for (let i = 0; i < x.length; i++) {
    const y = buf[idx];
    store = y * (1 - damp) + store * damp;
    buf[idx] = x[i] + store * feedback;
    idx = (idx + 1) % delay;
    out[i] = y;
  }
  return out;
}

function allpass(x: Float32Array, delay: number, feedback: number): Float32Array {
  const buf = new Float32Array(delay);
  const out = new Float32Array(x.length);
  let idx = 0;
  for (let i = 0; i < x.length; i++) {
    const bufout = buf[idx];
    out[i] = -x[i] + bufout;
    buf[idx] = x[i] + bufout * feedback;
    idx = (idx + 1) % delay;
  }
  return out;
}

// --- time-stretch (WSOLA) + pitch shift ------------------------------------

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Linear resample: output plays `ratio`× faster (length /= ratio, pitch ×ratio). */
export function resample(x: Float32Array, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-4) return Float32Array.from(x);
  const outLen = Math.max(1, Math.round(x.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const j = i * ratio, i0 = Math.floor(j), t = j - i0;
    out[i] = (x[i0] ?? 0) * (1 - t) + (x[i0 + 1] ?? 0) * t;
  }
  return out;
}

/**
 * WSOLA time-stretch: output length ≈ input × `stretch`, pitch unchanged. Uses
 * a similarity search per frame to keep waveforms phase-aligned across the
 * overlap, which is what avoids the robotic artifacts of plain OLA.
 */
export function timeStretch(x: Float32Array, stretch: number): Float32Array {
  if (Math.abs(stretch - 1) < 1e-3 || x.length < 2048) return Float32Array.from(x);
  const N = 1024, Hs = N >> 1, Ha = Math.max(1, Math.round(Hs / stretch)), D = N >> 2;
  const w = hann(N);
  const outLen = Math.ceil(x.length * stretch) + N;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const place = (start: number, at: number) => {
    for (let k = 0; k < N; k++) { const s = x[start + k] ?? 0; out[at + k] += s * w[k]; norm[at + k] += w[k]; }
  };
  place(0, 0);
  let syn = Hs, ana = Ha, prevStart = 0;
  while (syn + N < outLen && ana + N < x.length) {
    // Find the offset δ where x[ana+δ …] best continues the previous frame.
    let bestD = 0, best = -Infinity;
    const lo = Math.max(-D, -ana), hi = Math.min(D, x.length - N - ana);
    for (let d = lo; d <= hi; d++) {
      let dot = 0;
      for (let k = 0; k < N; k += 4) dot += (x[ana + d + k] ?? 0) * (x[prevStart + Hs + k] ?? 0);
      if (dot > best) { best = dot; bestD = d; }
    }
    const start = ana + bestD;
    place(start, syn);
    prevStart = start; syn += Hs; ana += Ha;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-6) out[i] /= norm[i];
  return out.slice(0, Math.max(1, Math.round(x.length * stretch)));
}

/** Shift pitch by `semitones`, preserving duration (stretch then resample). */
export function pitchShift(x: Float32Array, semitones: number): Float32Array {
  if (Math.abs(semitones) < 1e-3) return Float32Array.from(x);
  const ratio = Math.pow(2, semitones / 12);
  return resample(timeStretch(x, ratio), ratio);
}

// --- dynamics: compressor + noise gate -------------------------------------

/**
 * Feed-forward peak compressor with attack/release ballistics. Operates on a
 * single channel; callers apply it per channel with a SHARED envelope for
 * stereo-linked behavior (pass the same envelope array). This is a real
 * compressor (level-dependent gain reduction over time), not a static trim.
 *
 * thresholdDb: knee point. ratio: >1. attackSec/releaseSec: envelope speed.
 */
export function compress(
  x: Float32Array, sampleRate: number,
  thresholdDb: number, ratio: number, attackSec: number, releaseSec: number,
  makeupDb = 0, kneeDb = 0,
): Float32Array {
  const thr = thresholdDb;
  const r = Math.max(1, ratio);
  const atk = Math.exp(-1 / (Math.max(1e-4, attackSec) * sampleRate));
  const rel = Math.exp(-1 / (Math.max(1e-4, releaseSec) * sampleRate));
  const makeup = Math.pow(10, makeupDb / 20);
  const k = Math.max(0, kneeDb);
  const slope = 1 - 1 / r;
  const out = new Float32Array(x.length);
  let env = 0; // smoothed level estimate (linear)
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a;
    const levelDb = env > 1e-6 ? 20 * Math.log10(env) : -120;
    // Soft-knee static curve: below thr-k/2 = no reduction, above thr+k/2 =
    // full ratio, quadratic interpolation across the knee width in between.
    let gainDb = 0;
    if (k > 0 && levelDb > thr - k / 2 && levelDb < thr + k / 2) {
      const over = levelDb - (thr - k / 2);
      gainDb = -slope * (over * over) / (2 * k);
    } else if (levelDb >= thr + k / 2) {
      gainDb = (thr - levelDb) * slope; // negative (full ratio)
    }
    out[i] = x[i] * Math.pow(10, gainDb / 20) * makeup;
  }
  return out;
}

/**
 * Downward noise gate: below `thresholdDb` the signal is smoothly attenuated to
 * silence. `attackSec`/`releaseSec` smooth the gate to avoid clicks.
 */
export function gate(
  x: Float32Array, sampleRate: number,
  thresholdDb: number, attackSec = 0.005, releaseSec = 0.05,
): Float32Array {
  const thr = Math.pow(10, Math.min(0, thresholdDb) / 20);
  const atk = 1 / Math.max(1, attackSec * sampleRate);
  const rel = 1 / Math.max(1, releaseSec * sampleRate);
  const out = new Float32Array(x.length);
  let g = 0;
  for (let i = 0; i < x.length; i++) {
    const target = Math.abs(x[i]) >= thr ? 1 : 0;
    g += (target - g) * (target > g ? atk : rel);
    out[i] = x[i] * g;
  }
  return out;
}

const COMB_TUNINGS = [1116, 1188, 1277, 1356];   // samples @ 44.1 kHz
const ALLPASS_TUNINGS = [556, 441, 341, 225];

/** `amount` 0..1 — dry/wet mix and room size. Returns a new array. */
export function reverb(x: Float32Array, sampleRate: number, amount: number): Float32Array {
  const scale = sampleRate / 44100;
  const feedback = 0.7 + 0.28 * Math.min(1, Math.max(0, amount)); // room size
  const damp = 0.2;
  const wet = new Float32Array(x.length);
  // Parallel comb filters, summed.
  for (const t of COMB_TUNINGS) {
    const c = combFilter(x, Math.max(1, Math.round(t * scale)), feedback, damp);
    for (let i = 0; i < wet.length; i++) wet[i] += c[i];
  }
  for (let i = 0; i < wet.length; i++) wet[i] /= COMB_TUNINGS.length;
  // Series allpass diffusion.
  let diffused: Float32Array = wet;
  for (const t of ALLPASS_TUNINGS) diffused = allpass(diffused, Math.max(1, Math.round(t * scale)), 0.5);
  // Dry/wet mix.
  const w = Math.min(1, Math.max(0, amount));
  const out = new Float32Array(x.length);
  for (let i = 0; i < out.length; i++) out[i] = x[i] * (1 - w * 0.6) + diffused[i] * (w * 0.9);
  return out;
}
