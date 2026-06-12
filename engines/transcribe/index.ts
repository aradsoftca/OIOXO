/**
 * Speech-to-text engine — runs a small Whisper model in the browser via
 * transformers.js. The first run for a given model size downloads + caches the
 * model weights; subsequent runs use the cached copy.
 */

import { configureOnnxRuntime } from '@/lib/compute/concurrency';

export type TranscribeSize = 'tiny' | 'base' | 'small';

export interface TranscribeChunk {
  /** Inclusive start time in seconds */
  start: number;
  /** Exclusive end time in seconds */
  end: number;
  text: string;
}

export interface TranscribeResult {
  text: string;
  chunks: TranscribeChunk[];
  language?: string;
  duration: number;
}

export interface TranscribeProgress {
  phase: string;
  ratio: number; // 0..1
}

export interface TranscribeOptions {
  /** Model size — tiny is fastest (~40 MB), small is most accurate (~150 MB). */
  size?: TranscribeSize;
  /** BCP-47 language code, e.g. "en", "es". Omit for auto-detect. */
  language?: string;
  /** Translate non-English audio to English instead of transcribing in source language. */
  translate?: boolean;
  /** Return per-word timestamps when true; otherwise per-sentence chunks. */
  wordTimestamps?: boolean;
  onProgress?: (p: TranscribeProgress) => void;
  /** Per-action permission ticket. Engine asserts server-side before loading
   *  the (large) model — a clone gets denied before any download. */
  permission?: import('@/lib/limits/permission').Permission | null;
  toolKey?: string;
  inputHash?: string;
}

const MODEL_ID: Record<TranscribeSize, string> = {
  tiny:  'Xenova/whisper-tiny',
  base:  'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
};

type Pipeline = (
  input: Float32Array | { array: Float32Array; sampling_rate: number },
  options?: Record<string, unknown>,
) => Promise<{
  text: string;
  chunks?: { timestamp: [number, number | null]; text: string }[];
}>;

interface PipelineCache {
  size: TranscribeSize;
  pipeline: Pipeline;
}
let cached: PipelineCache | null = null;

async function getPipeline(size: TranscribeSize, onProgress?: (p: TranscribeProgress) => void): Promise<Pipeline> {
  if (cached && cached.size === size) return cached.pipeline;
  // Release the previous model BEFORE loading a new one. Whisper checkpoints
  // are 40–150 MB each; previously switching sizes orphaned the prior
  // pipeline and its ONNX session + WASM heap, leaking that much memory.
  if (cached) {
    try { (cached.pipeline as unknown as { dispose?: () => Promise<void> | void }).dispose?.(); } catch { /* */ }
    cached = null;
  }

  // Prefer transformers.js v3 (@huggingface/transformers). v2 (@xenova) 2.17.2
  // is hard-broken in a cross-origin-isolated tab: its bundled onnxruntime-web
  // 1.14.0 unconditionally imports the JSEP loader `ort-wasm-simd-threaded.jsep.mjs`
  // that ORT version never shipped → a 404 that silently killed every studio's
  // transcription. v3 ships a matched modern ORT (WebGPU + WASM, real JSEP), so
  // the same pipeline runs. Fall back to v2 only if v3 isn't present.
  const lib: any = await import('@huggingface/transformers').catch(() => null) // eslint-disable-line @typescript-eslint/no-explicit-any
    ?? await import('@xenova/transformers');
  // Make sure models load from the HF CDN, not local /models.
  lib.env.allowLocalModels = false;
  lib.env.allowRemoteModels = true;
  lib.env.useBrowserCache = true;
  // v2 needs the WASM threadpool tuned; v3 manages its own runtime, so this is
  // a best-effort no-op there.
  configureOnnxRuntime(lib);

  const progress_callback = (data: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
    if (!onProgress) return;
    const ratio = data.progress != null ? data.progress / 100
      : (data.loaded && data.total ? data.loaded / data.total : 0);
    const phase = data.status === 'progress' || data.status === 'download' ? 'Loading model'
      : data.status === 'ready' ? 'Ready'
      : data.status === 'initiate' ? 'Loading model'
      : data.status;
    onProgress({ phase, ratio: Math.max(0, Math.min(1, ratio)) });
  };

  // Prefer the WebGPU execution provider (v3 only) — it's an order of magnitude
  // faster than WASM for Whisper and, crucially, completes where the WASM path
  // can stall on long single-context inference. fp16 weights match WebGPU; we
  // fall back to WASM/q8 if WebGPU isn't present or the GPU session fails to
  // build (some drivers/integrated GPUs reject the shader). v2 has no `device`
  // option, so only pass it when v3 is loaded (detected via AutoModel presence).
  const isV3 = typeof lib.AutoModelForVision2Seq !== 'undefined' || typeof lib.AutoModel?.from_pretrained === 'function';
  const canWebGpu = isV3 && typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu;

  let pipe: Pipeline | null = null;
  if (canWebGpu) {
    try {
      pipe = await lib.pipeline('automatic-speech-recognition', MODEL_ID[size], {
        device: 'webgpu', dtype: 'fp16', progress_callback,
      }) as unknown as Pipeline;
    } catch { pipe = null; /* fall through to WASM */ }
  }
  if (!pipe) {
    pipe = await lib.pipeline('automatic-speech-recognition', MODEL_ID[size], {
      quantized: true, progress_callback,
    }) as unknown as Pipeline;
  }
  cached = { size, pipeline: pipe };
  return pipe;
}

/**
 * Decode an audio file to a 16 kHz mono Float32Array — Whisper's expected input format.
 */
export async function audioToWhisperInput(blob: Blob): Promise<{ samples: Float32Array; duration: number }> {
  const buffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tempCtx = new Ctx();
  const decoded = await tempCtx.decodeAudioData(buffer.slice(0));
  await tempCtx.close();

  // Down-mix to mono.
  const length = decoded.length;
  const mono = new Float32Array(length);
  if (decoded.numberOfChannels === 1) {
    mono.set(decoded.getChannelData(0));
  } else {
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += ch[i];
    }
    for (let i = 0; i < length; i++) mono[i] /= decoded.numberOfChannels;
  }

  // Resample to 16 kHz with OfflineAudioContext for high-quality output.
  const targetRate = 16000;
  if (decoded.sampleRate === targetRate) {
    return { samples: mono, duration: decoded.duration };
  }
  const targetLength = Math.ceil((length * targetRate) / decoded.sampleRate);
  const oac = new OfflineAudioContext(1, targetLength, targetRate);
  const monoBuffer = oac.createBuffer(1, length, decoded.sampleRate);
  monoBuffer.copyToChannel(mono, 0);
  const src = oac.createBufferSource();
  src.buffer = monoBuffer;
  src.connect(oac.destination);
  src.start(0);
  const rendered = await oac.startRendering();
  return { samples: rendered.getChannelData(0).slice(), duration: decoded.duration };
}

export async function transcribe(blob: Blob, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
  if (opts.permission?.ticket && opts.toolKey) {
    const { assertPermission } = await import('@/lib/limits/permission');
    await assertPermission(opts.permission, opts.toolKey, opts.inputHash ?? '');
  }
  const size = opts.size ?? 'tiny';
  opts.onProgress?.({ phase: 'Reading audio', ratio: 0 });
  const { samples, duration } = await audioToWhisperInput(blob);
  opts.onProgress?.({ phase: 'Loading model', ratio: 0.1 });
  const pipe = await getPipeline(size, opts.onProgress);
  opts.onProgress?.({ phase: 'Transcribing', ratio: 0.4 });

  const out = await pipe({ array: samples, sampling_rate: 16000 }, {
    return_timestamps: opts.wordTimestamps ? 'word' : true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language: opts.language,
    task: opts.translate ? 'translate' : 'transcribe',
  });

  const chunks: TranscribeChunk[] = (out.chunks ?? []).map((c) => ({
    start: c.timestamp[0] ?? 0,
    end: c.timestamp[1] ?? duration,
    text: c.text,
  }));

  opts.onProgress?.({ phase: 'Done', ratio: 1 });
  return {
    text: out.text.trim(),
    chunks,
    language: opts.language,
    duration,
  };
}

export function chunksToSrt(chunks: TranscribeChunk[]): string {
  const fmt = (s: number) => {
    const ms = Math.floor((s % 1) * 1000);
    const total = Math.floor(s);
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`;
  };
  return chunks.map((c, i) =>
    `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text.trim()}\n`,
  ).join('\n');
}

export function chunksToVtt(chunks: TranscribeChunk[]): string {
  const fmt = (s: number) => {
    const ms = Math.floor((s % 1) * 1000);
    const total = Math.floor(s);
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}.${String(ms).padStart(3, '0')}`;
  };
  return 'WEBVTT\n\n' + chunks.map((c) =>
    `${fmt(c.start)} --> ${fmt(c.end)}\n${c.text.trim()}\n`,
  ).join('\n');
}
