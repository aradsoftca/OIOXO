/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM (CPU) chat engine — the fallback used when the browser has no WebGPU
 * (older devices, some mobile browsers). It runs a small instruct model through
 * transformers.js on the ONNX WASM backend — the same library and runtime this
 * app already uses for embeddings and speech, so no new dependency.
 *
 * It deliberately exposes the SAME shape as the web-llm engine
 * (`engine.chat.completions.create(...)`, streaming + non-streaming) so the rest
 * of the assistant — including the poster composer — works unchanged regardless
 * of which backend is live.
 */
import { configureOnnxRuntime } from '@/lib/compute/concurrency';

// Qwen 0.5B chat — same family as the WebGPU model, runs on transformers.js v2
// (Qwen2 architecture). Heavier on CPU than on GPU, but coherent; cached after
// the first load. Swap this one constant to trade quality for download size.
const MODEL_ID = 'Xenova/Qwen1.5-0.5B-Chat';

export interface WasmEngine {
  chat: { completions: { create: (opts: any) => Promise<any> } };
  /** Marks this as the CPU fallback so the UI can hint at compatibility mode. */
  readonly backend: 'wasm';
}

type ProgressCb = (pct: number) => void;

const _engines: Record<string, Promise<WasmEngine>> = {};

/** Load (once per model) a WASM text-generation engine. Default model = the small
 *  general chat; callers (e.g. the code skill) may pass a CODER id instead. */
export function loadWasmEngine(onProgress?: ProgressCb, modelId: string = MODEL_ID): Promise<WasmEngine> {
  _engines[modelId] ??= build(onProgress, modelId);
  return _engines[modelId];
}

async function build(onProgress?: ProgressCb, modelId: string = MODEL_ID): Promise<WasmEngine> {
  const lib: any = await import('@xenova/transformers');
  lib.env.allowLocalModels = false;
  lib.env.allowRemoteModels = true;
  configureOnnxRuntime(lib);

  // Average download progress across the model's files into a single 0..1 bar.
  const fileProg: Record<string, number> = {};
  const pipe: any = await lib.pipeline('text-generation', modelId, {
    quantized: true,
    progress_callback: (p: any) => {
      if (!onProgress || !p) return;
      if (p.status === 'progress' && typeof p.progress === 'number' && p.file) {
        fileProg[p.file] = p.progress; // 0..100 per file
        const vals = Object.values(fileProg);
        const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        onProgress(Math.min(0.99, avg / 100));
      } else if (p.status === 'ready') {
        onProgress(1);
      }
    },
  });

  const TextStreamer = lib.TextStreamer;

  const create = async (opts: any): Promise<any> => {
    const messages = opts?.messages ?? [];
    const temperature = typeof opts?.temperature === 'number' ? opts.temperature : 0.6;
    const doSample = temperature > 0;
    // Cap output so CPU latency stays bounded on phones.
    const maxNew = Math.min(typeof opts?.max_tokens === 'number' ? opts.max_tokens : 320, 512);
    const genOpts: any = {
      max_new_tokens: maxNew,
      do_sample: doSample,
      temperature: doSample ? Math.max(0.1, temperature) : undefined,
      top_p: doSample ? 0.9 : undefined,
      repetition_penalty: 1.1,
      return_full_text: false,
    };

    if (opts?.stream) {
      const q: string[] = [];
      let done = false;
      let wake: (() => void) | null = null;
      const streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (t: string) => { if (t) { q.push(t); wake?.(); wake = null; } },
      });
      // Fire generation; mark done when it settles (success or failure).
      pipe(messages, { ...genOpts, streamer })
        .catch(() => { /* stream simply ends */ })
        .finally(() => { done = true; wake?.(); wake = null; });

      return {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            if (q.length) { yield { choices: [{ delta: { content: q.shift() } }] }; continue; }
            if (done) return;
            await new Promise<void>((r) => { wake = r; });
          }
        },
      };
    }

    const res: any = await pipe(messages, genOpts);
    return { choices: [{ message: { content: extractText(res) } }] };
  };

  return { chat: { completions: { create } }, backend: 'wasm' };
}

/**
 * Normalize transformers.js output to a plain string. Depending on version and
 * whether the input was chat messages, `pipe(...)` returns a string, an array of
 * `{ generated_text }`, or message turns — handle each.
 */
function extractText(res: any): string {
  if (typeof res === 'string') return res;
  if (Array.isArray(res)) {
    const first = res[0];
    if (!first) return '';
    const gt = first.generated_text ?? first;
    if (typeof gt === 'string') return gt.trim();
    if (Array.isArray(gt)) {
      const last = gt[gt.length - 1];
      return typeof last?.content === 'string' ? last.content.trim() : '';
    }
  }
  return '';
}
