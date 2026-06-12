/**
 * Beat / tempo detection — on-device, NO model, NO upload, zero asset weight.
 *
 * Decode the audio → build an onset-energy envelope (how much the sound is
 * RISING, frame to frame — onsets are where beats live) → autocorrelate the
 * envelope to find the dominant period (tempo) → pick the beat phase that lines
 * up best with the onsets → emit beat timestamps. Classic music-IR DSP, ~ms to
 * run, the free browser-only answer to CapCut's "snap cuts to the beat".
 *
 * Pure math on a Float32Array, so the core (envelopeToBeats) is unit-testable
 * without Web Audio.
 */

export interface BeatInfo {
  bpm: number;
  /** Beat onset times in seconds (0-based). */
  beats: number[];
  /** 0..1 confidence in the detected tempo (autocorrelation peak strength). */
  confidence: number;
}

const FRAME_RATE = 100; // envelope frames per second (10 ms hop)

/** Decode an audio/video File to a mono Float32Array + sample rate. */
async function decodeMono(file: Blob): Promise<{ data: Float32Array; sampleRate: number } | null> {
  const AC: typeof AudioContext = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const data = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) data[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
    return { data, sampleRate: buf.sampleRate };
  } catch {
    return null;
  } finally {
    try { await ctx.close(); } catch { /* */ }
  }
}

/** RMS-per-frame, then half-wave-rectified first difference = the onset envelope. */
export function onsetEnvelope(data: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / FRAME_RATE));
  const nFrames = Math.floor(data.length / hop);
  const rms = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let sum = 0;
    const s0 = f * hop, s1 = s0 + hop;
    for (let i = s0; i < s1; i++) sum += data[i] * data[i];
    rms[f] = Math.sqrt(sum / hop);
  }
  // Onset = positive change in energy (a hit makes energy jump up).
  const env = new Float32Array(nFrames);
  for (let f = 1; f < nFrames; f++) env[f] = Math.max(0, rms[f] - rms[f - 1]);
  return env;
}

/**
 * Core, testable: given an onset envelope at FRAME_RATE fps, return tempo + beats.
 * Autocorrelates the envelope over the 60–180 BPM range, then phase-aligns.
 */
export function envelopeToBeats(env: Float32Array, frameRate = FRAME_RATE, totalDuration?: number): BeatInfo {
  const n = env.length;
  const dur = totalDuration ?? n / frameRate;
  if (n < frameRate) return { bpm: 0, beats: [], confidence: 0 };

  // Search tempi 60..180 BPM → lag in frames.
  const minBpm = 60, maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * frameRate);
  const maxLag = Math.ceil((60 / minBpm) * frameRate);

  // Autocorrelation at each candidate lag (normalised energy already in env).
  const acf: number[] = new Array(maxLag + 1).fill(0);
  let bestLag = minLag, bestScore = -Infinity, total = 0, cnt = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < n; i++) acc += env[i] * env[i - lag];
    acc /= (n - lag);
    acf[lag] = acc; total += acc; cnt++;
    if (acc > bestScore) { bestScore = acc; bestLag = lag; }
  }
  // Octave correction: pure autocorrelation also peaks at 2× / 3× the true
  // period (every other beat aligns perfectly), so it tends to report HALF the
  // tempo. If a lag at bestLag/2 or /3 still correlates nearly as strongly,
  // prefer the faster tempo — it's the real beat, not the bar.
  for (const div of [2, 3]) {
    const fastLag = Math.round(bestLag / div);
    if (fastLag >= minLag && acf[fastLag] >= bestScore * 0.8) { bestLag = fastLag; bestScore = acf[fastLag]; }
  }
  const mean = total / cnt;
  const confidence = mean > 0 ? Math.max(0, Math.min(1, (bestScore - mean) / (bestScore + mean))) : 0;
  const bpm = (60 * frameRate) / bestLag;

  // Phase: try every offset within one beat period, keep the one whose beat
  // frames sum the most onset energy.
  let bestPhase = 0, bestPhaseScore = -Infinity;
  for (let phase = 0; phase < bestLag; phase++) {
    let acc = 0;
    for (let f = phase; f < n; f += bestLag) acc += env[f];
    if (acc > bestPhaseScore) { bestPhaseScore = acc; bestPhase = phase; }
  }

  const beats: number[] = [];
  for (let f = bestPhase; f < n; f += bestLag) {
    const t = f / frameRate;
    if (t <= dur) beats.push(+t.toFixed(3));
  }
  return { bpm: Math.round(bpm), beats, confidence: +confidence.toFixed(3) };
}

/** Full pipeline: File → BeatInfo. Returns null if audio can't be decoded. */
export async function detectBeats(file: Blob): Promise<BeatInfo | null> {
  const dec = await decodeMono(file);
  if (!dec) return null;
  const env = onsetEnvelope(dec.data, dec.sampleRate);
  return envelopeToBeats(env, FRAME_RATE, dec.data.length / dec.sampleRate);
}
