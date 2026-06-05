/**
 * Live captions via on-device Whisper (transformers.js). Each speaker runs ASR
 * on their own microphone and broadcasts text over the data channel — far
 * cheaper than transcribing every remote stream, and accurate because each
 * person captures the closest mic.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CaptionsHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: Error) => void;
}

export interface CaptionsSession {
  stop: () => void;
}

const SAMPLE_RATE = 16000;
const CHUNK_MS = 4000;
const OVERLAP_MS = 400;

let pipelinePromise: Promise<any> | null = null;

async function getPipeline(): Promise<any> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const tx: any = await import('@huggingface/transformers').catch(() => null) ?? await import('@xenova/transformers');
      tx.env.allowLocalModels = false;
      tx.env.useBrowserCache = true;
      const model = 'Xenova/whisper-tiny.en';
      return tx.pipeline('automatic-speech-recognition', model, { quantized: true });
    })();
  }
  return pipelinePromise;
}

function downsample(input: Float32Array, srIn: number, srOut: number): Float32Array {
  if (srIn === srOut) return input;
  const ratio = srIn / srOut;
  const len = Math.floor(input.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (idx - i0);
  }
  return out;
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export async function startCaptions(stream: MediaStream, h: CaptionsHandlers): Promise<CaptionsSession> {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const src = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const dest = ctx.createMediaStreamDestination();
  src.connect(processor);
  processor.connect(dest);

  const inSampleRate = ctx.sampleRate;
  const chunkSamples = Math.floor((CHUNK_MS / 1000) * SAMPLE_RATE);
  const overlapSamples = Math.floor((OVERLAP_MS / 1000) * SAMPLE_RATE);

  let buf = new Float32Array(0);
  let busy = false;
  let stopped = false;

  let pipe: any = null;
  try {
    pipe = await getPipeline();
  } catch (e) {
    h.onError?.(e as Error);
    return { stop: () => { try { processor.disconnect(); src.disconnect(); void ctx.close(); } catch { /* */ } } };
  }

  const concat = (a: Float32Array, b: Float32Array) => {
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  };

  const transcribe = async () => {
    if (busy || stopped || buf.length < chunkSamples) return;
    busy = true;
    try {
      const slice = buf.slice(0, chunkSamples);
      buf = buf.slice(chunkSamples - overlapSamples);
      const energy = rms(slice);
      if (energy < 0.005) { busy = false; return; }
      const out = await pipe(slice, { return_timestamps: false });
      const text = (out?.text ?? '').trim();
      if (text) h.onFinal(text);
    } catch (e) {
      h.onError?.(e as Error);
    } finally {
      busy = false;
    }
  };

  processor.onaudioprocess = (ev) => {
    if (stopped) return;
    const input = ev.inputBuffer.getChannelData(0);
    const down = downsample(input, inSampleRate, SAMPLE_RATE);
    buf = concat(buf, down);
    if (buf.length >= chunkSamples) void transcribe();
  };

  return {
    stop: () => {
      stopped = true;
      try { processor.disconnect(); src.disconnect(); void ctx.close(); } catch { /* */ }
    },
  };
}
