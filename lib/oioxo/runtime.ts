/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — model runtime. Downloads + runs skill models in the browser via
 * @mlc-ai/web-llm (the same engine the assistant already uses). Models are
 * matched against the LIVE prebuilt list by substring, so we never hard-depend
 * on an exact id that may change between web-llm versions. Engines are cached
 * per id for the session; web-llm caches the weights to disk for next time.
 */
import { loadWasmEngine } from '@/lib/ai/wasm-llm';

let _webllm: any = null;
const _engines: Record<string, any> = {};

async function webllm(): Promise<any> {
  _webllm ??= await import('@mlc-ai/web-llm');
  return _webllm;
}

// Does this device have usable WebGPU? If not, we run the on-device model on the
// CPU/WASM engine instead of failing — so the coder works on EVERY device, not
// only GPU ones (the chat assistant already does this; the coder now matches).
let _gpu: boolean | null = null;
export async function hasWebGPU(): Promise<boolean> {
  if (_gpu !== null) return _gpu;
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } })?.gpu;
    _gpu = !!gpu && !!(await gpu.requestAdapter());
  } catch { _gpu = false; }
  return _gpu;
}

/** The concrete prebuilt model id for a set of name substrings, or null. */
export async function resolveModelId(match: string[]): Promise<string | null> {
  const lib = await webllm();
  const list: { model_id: string }[] = lib.prebuiltAppConfig?.model_list ?? [];
  const found = list.find((m) => match.some((s) => m.model_id.includes(s)));
  return found?.model_id ?? null;
}

/** True if any of the match substrings exists in the live runtime catalog. */
export async function isModelAvailable(match: string[]): Promise<boolean> {
  return (await resolveModelId(match)) != null;
}

export interface LoadedEngine {
  modelId: string;
  engine: any;
}

/**
 * Download (if needed) + initialize a model, reporting 0..1 progress. Resolves
 * with a ready engine. Throws if the model isn't in the runtime catalog.
 */
export async function loadModel(match: string[], onProgress?: (p: number) => void): Promise<LoadedEngine> {
  const lib = await webllm();
  const modelId = await resolveModelId(match);
  if (!modelId) throw new Error('This model is not available for the in-browser runtime yet.');
  if (_engines[modelId]) {
    onProgress?.(1);
    return { modelId, engine: _engines[modelId] };
  }
  const engine = await lib.CreateMLCEngine(modelId, {
    initProgressCallback: (r: any) => onProgress?.(typeof r?.progress === 'number' ? r.progress : 0),
  });
  _engines[modelId] = engine;
  return { modelId, engine };
}

/** A previously loaded engine for a model id, if still in memory. */
export function getEngine(modelId: string): any | null {
  return _engines[modelId] ?? null;
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A transient on-device engine failure (WebGPU buffer/device loss) — distinct
 *  from a real error. Reloading the engine often clears it. */
function isTransientEngineError(msg: string): boolean {
  return /model not loaded|gpubuffer|mapasync|device.*lost|unmapped|reload\(/i.test(msg);
}

/** Drop a dead engine so the next load rebuilds it fresh (recover from GPU loss). */
async function dropEngine(match: string[]): Promise<void> {
  const id = await resolveModelId(match);
  if (id && _engines[id]) {
    try { await _engines[id].unload?.(); } catch { /* */ }
    delete _engines[id];
  }
}

// On a weak/no-GPU device the WRITER runs on CPU/WASM. Use a small CODER (good at
// emitting code) rather than the general chat model; fall back to the general one
// if the coder can't load, so it never breaks.
const CODER_WASM = 'onnx-community/Qwen2.5-Coder-0.5B-Instruct';

/** The CPU/WASM engine running the same call shape — the fallback when WebGPU is
 *  absent or fails. Slower, but it works on any device. */
async function wasmCreate(messages: ChatMsg[], opts: ChatOpts, stream: boolean): Promise<any> {
  let eng;
  try { eng = await loadWasmEngine(opts.onProgress, CODER_WASM); }
  catch { eng = await loadWasmEngine(opts.onProgress); } // coder unavailable → general
  return eng.chat.completions.create({
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 640,
    response_format: opts.responseFormat, // Gem 1: constrained decoding (e.g. json_object)
    stream,
  });
}

/** Shared chat options. `responseFormat` constrains decoding (MLC supports
 *  `{type:'json_object'}` and `{type:'grammar',grammar}`) — used to force a weak
 *  coder's REPAIR into a parseable edit list so it can't emit prose-as-a-file. */
export interface ChatOpts {
  onProgress?: (p: number) => void;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: 'json_object' } | { type: 'grammar'; grammar: string };
}

/** One-shot chat against a skill model. WebGPU fast path; on no-WebGPU or a
 *  transient engine death it reloads once, then falls back to CPU/WASM — so it
 *  returns a result on every device instead of throwing an engine error. */
export async function chat(
  match: string[],
  messages: ChatMsg[],
  opts: ChatOpts = {},
): Promise<string> {
  const viaWasm = async () => (await wasmCreate(messages, opts, false))?.choices?.[0]?.message?.content ?? '';
  if (!(await hasWebGPU())) return viaWasm();
  const run = async () => {
    const { engine } = await loadModel(match, opts.onProgress);
    const res = await engine.chat.completions.create({ messages, temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 640, response_format: opts.responseFormat });
    return res?.choices?.[0]?.message?.content ?? '';
  };
  try {
    return await run();
  } catch (e) {
    if (isTransientEngineError(String((e as Error)?.message || e))) {
      try { await dropEngine(match); return await run(); } catch { /* fall through to WASM */ }
    }
    return viaWasm(); // last resort: CPU
  }
}

/** Streaming chat — yields text deltas as the model generates, so the UI fills
 *  in live instead of freezing until the whole reply is ready. */
export async function* chatStream(
  match: string[],
  messages: ChatMsg[],
  opts: { onProgress?: (p: number) => void; maxTokens?: number; temperature?: number } = {},
): AsyncGenerator<string> {
  // Pick the stream source: WebGPU model, else (or on engine death) CPU/WASM.
  const openStream = async (): Promise<any> => {
    if (!(await hasWebGPU())) return wasmCreate(messages, opts, true);
    try {
      const { engine } = await loadModel(match, opts.onProgress);
      return await engine.chat.completions.create({ messages, temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 640, stream: true });
    } catch (e) {
      if (isTransientEngineError(String((e as Error)?.message || e))) {
        try { await dropEngine(match); const { engine } = await loadModel(match, opts.onProgress); return await engine.chat.completions.create({ messages, temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 640, stream: true }); } catch { /* fall to WASM */ }
      }
      return wasmCreate(messages, opts, true); // last resort: CPU
    }
  };
  const stream = await openStream();
  for await (const chunk of stream) {
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) yield delta as string;
  }
}

/** Free a loaded engine (release VRAM) — the platform pages models like memory. */
export async function unloadModel(modelId: string): Promise<void> {
  const e = _engines[modelId];
  if (!e) return;
  try {
    await e.unload?.();
  } catch {
    /* ignore */
  }
  delete _engines[modelId];
}
