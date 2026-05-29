/**
 * Noise-removal engine — runs a small recurrent-network noise suppressor in
 * the browser. The model is tuned for human speech, so it shines on voice
 * memos, podcasts, and meeting recordings.
 */

export interface DenoiseProgress {
  phase: string;
  ratio: number; // 0..1
}

export interface DenoiseOptions {
  /** Mix of denoised vs original signal, 0..1. Default 1 (full denoise). */
  strength?: number;
  onProgress?: (p: DenoiseProgress) => void;
}

interface DenoiseStateApi {
  processFrame(frame: Float32Array): number;
  destroy(): void;
}
interface RnnoiseInstance {
  readonly frameSize: number;
  createDenoiseState(): DenoiseStateApi;
}
let rnnoiseReady: Promise<RnnoiseInstance> | null = null;

async function loadRnnoise(): Promise<RnnoiseInstance> {
  if (!rnnoiseReady) {
    const p = (async () => {
      const mod = await import('@shiguredo/rnnoise-wasm');
      const rnnoise = await mod.Rnnoise.load();
      return rnnoise as unknown as RnnoiseInstance;
    })();
    // Clear the cache on rejection so a transient WASM-load failure doesn't
    // permanently disable denoise for the rest of the page lifetime.
    p.catch(() => { rnnoiseReady = null; });
    rnnoiseReady = p;
  }
  return rnnoiseReady;
}

/**
 * Resample a single Float32Array channel from `srcRate` to `dstRate` using
 * OfflineAudioContext so we get the browser's good-quality resampler.
 */
async function resample(samples: Float32Array, srcRate: number, dstRate: number): Promise<Float32Array> {
  if (srcRate === dstRate) return samples;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tempCtx = new Ctx();
  const sourceBuf = tempCtx.createBuffer(1, samples.length, srcRate);
  // Slice into a fresh ArrayBuffer so the typed-array isn't bound to a SharedArrayBuffer.
  sourceBuf.copyToChannel(samples.slice() as Float32Array<ArrayBuffer>, 0);
  await tempCtx.close();

  const targetLength = Math.ceil((samples.length * dstRate) / srcRate);
  const oac = new OfflineAudioContext(1, targetLength, dstRate);
  const src = oac.createBufferSource();
  src.buffer = sourceBuf;
  src.connect(oac.destination);
  src.start(0);
  const rendered = await oac.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * Run RNNoise on a Float32 channel at 48 kHz. Mutates a copy and returns it.
 */
function denoiseChannel48k(input: Float32Array, denoiseState: { processFrame(f: Float32Array): number; destroy(): void }, frameSize: number): Float32Array {
  const out = new Float32Array(input.length);
  const frame = new Float32Array(frameSize);
  for (let i = 0; i < input.length; i += frameSize) {
    const remaining = input.length - i;
    const take = Math.min(frameSize, remaining);
    // RNNoise expects samples in 16-bit PCM range.
    for (let j = 0; j < take; j++) frame[j] = input[i + j] * 32768;
    if (take < frameSize) for (let j = take; j < frameSize; j++) frame[j] = 0;
    denoiseState.processFrame(frame);
    for (let j = 0; j < take; j++) out[i + j] = Math.max(-1, Math.min(1, frame[j] / 32768));
  }
  return out;
}

export async function denoise(ab: AudioBuffer, opts: DenoiseOptions = {}): Promise<AudioBuffer> {
  const strength = Math.max(0, Math.min(1, opts.strength ?? 1));
  opts.onProgress?.({ phase: 'Loading model', ratio: 0 });
  const rnnoise = await loadRnnoise();
  const denoiseState = rnnoise.createDenoiseState();
  const frameSize = rnnoise.frameSize; // 480 @ 48 kHz

  try {
    const channels = ab.numberOfChannels;
    const denoisedChannels: Float32Array[] = [];

    for (let c = 0; c < channels; c++) {
      opts.onProgress?.({ phase: `Cleaning channel ${c + 1}/${channels}`, ratio: 0.1 + 0.7 * (c / channels) });
      const ch = ab.getChannelData(c);
      const at48k = await resample(ch, ab.sampleRate, 48000);
      const cleaned48k = denoiseChannel48k(at48k, denoiseState, frameSize);
      const backToSrc = await resample(cleaned48k, 48000, ab.sampleRate);
      // Trim/pad to original length so output matches source duration exactly.
      const final = new Float32Array(ch.length);
      const copy = Math.min(final.length, backToSrc.length);
      for (let i = 0; i < copy; i++) {
        // Mix denoised with original by strength.
        final[i] = backToSrc[i] * strength + ch[i] * (1 - strength);
      }
      denoisedChannels.push(final);
    }

    opts.onProgress?.({ phase: 'Done', ratio: 1 });
    const out = new AudioBuffer({
      length: ab.length,
      numberOfChannels: channels,
      sampleRate: ab.sampleRate,
    });
    for (let c = 0; c < channels; c++) out.copyToChannel(denoisedChannels[c] as Float32Array<ArrayBuffer>, c);
    return out;
  } finally {
    try { denoiseState.destroy(); } catch { /* noop */ }
  }
}
