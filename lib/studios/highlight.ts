/**
 * Auto-highlight: pick the most "interesting" window of a video by AUDIO ENERGY.
 *
 * Deterministic, on-device, NO model: decode the audio, compute short-window RMS
 * energy, then slide a target-length window and return the position with the
 * highest summed energy (loud/active speech & music = the highlight). It's an
 * honest heuristic — not ML scene-understanding — but it reliably beats "just
 * take the first 30s" and needs no download. (vs Opus Clip's server ML; this is
 * the browser-only, free version.)
 */

export interface Highlight { start: number; length: number; score: number }

export async function findHighlight(file: File, targetLen: number): Promise<Highlight | null> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const dur = buf.duration;
    if (dur <= targetLen) return { start: 0, length: dur, score: 1 }; // whole thing
    // Mix to mono energy at ~10 bins/sec.
    const binsPerSec = 10;
    const nBins = Math.max(1, Math.floor(dur * binsPerSec));
    const energy = new Float32Array(nBins);
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const samplesPerBin = Math.floor(buf.length / nBins);
    for (let b = 0; b < nBins; b++) {
      let sum = 0;
      const s0 = b * samplesPerBin, s1 = Math.min(buf.length, s0 + samplesPerBin);
      for (let i = s0; i < s1; i++) {
        const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        sum += v * v;
      }
      energy[b] = Math.sqrt(sum / Math.max(1, s1 - s0)); // RMS
    }
    // Slide a target-length window (in bins) and find the max-energy position.
    const winBins = Math.max(1, Math.round(targetLen * binsPerSec));
    let running = 0;
    for (let i = 0; i < winBins && i < nBins; i++) running += energy[i];
    let best = running, bestStart = 0;
    for (let i = winBins; i < nBins; i++) {
      running += energy[i] - energy[i - winBins];
      if (running > best) { best = running; bestStart = i - winBins + 1; }
    }
    const startSec = bestStart / binsPerSec;
    return { start: Math.max(0, Math.min(dur - targetLen, startSec)), length: targetLen, score: best / winBins };
  } catch {
    return null;
  } finally {
    try { await ctx.close(); } catch { /* */ }
  }
}
