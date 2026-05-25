/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — serve OUR fine-tuned conductor in the browser via transformers.js
 * (ONNX), the SAME runtime the writer uses. This sidesteps web-llm/MLC entirely:
 * the conductor is exported to ONNX on arad, hosted in transformers.js layout on
 * our own origin (a Pro asset), and loaded here. Mirrors lib/ai/wasm-llm.ts.
 *
 * Lazy + single-load. Pointed at a configurable model id + host so the same code
 * serves v0 today and a data-trained v1 later by swapping the hosted files.
 */
import { configureOnnxRuntime } from '@/lib/compute/concurrency';

export interface ConductorEngineCfg {
  /** Model path under the host, transformers.js style (e.g. 'models/oioxo-conductor'). */
  modelId: string;
  /** Origin serving the model files (e.g. 'https://oioxo.com'). Defaults to same-origin. */
  host?: string;
  /** Quantized ONNX (smaller download). Default true. */
  quantized?: boolean;
  /** Weights are AES-encrypted ("permission as a key") — fetch the key from
   *  /api/code-key, decrypt, and prime the cache before loading. See protected-model. */
  protected?: boolean;
}

let _enginePromise: Promise<any> | null = null;
let _cfgKey = '';

/** Load (once) a transformers.js text-generation pipeline for the conductor. */
function loadEngine(cfg: ConductorEngineCfg, onProgress?: (p: number) => void): Promise<any> {
  const key = `${cfg.host || ''}|${cfg.modelId}|${cfg.quantized !== false}`;
  if (_enginePromise && key === _cfgKey) return _enginePromise;
  _cfgKey = key;
  _enginePromise = (async () => {
    // Encrypted weights: get the key from our origin, decrypt, prime the cache —
    // so the load below finds the plaintext bytes locally and never off the wire.
    if (cfg.protected) {
      const { loadProtectedModel } = await import('./protected-model');
      await loadProtectedModel({ modelId: cfg.modelId, host: cfg.host || (typeof window !== 'undefined' ? window.location.origin : '') });
    }
    const lib: any = await import('@xenova/transformers');
    lib.env.allowLocalModels = false;
    lib.env.allowRemoteModels = true;
    if (cfg.host) {
      // Fetch model files from OUR origin instead of HF Hub.
      lib.env.remoteHost = cfg.host.replace(/\/$/, '');
      lib.env.remotePathTemplate = '{model}'; // host serves files at {host}/{model}/...
    }
    configureOnnxRuntime(lib);
    const fileProg: Record<string, number> = {};
    return lib.pipeline('text-generation', cfg.modelId, {
      quantized: cfg.quantized !== false,
      progress_callback: (p: any) => {
        if (!onProgress || !p) return;
        if (p.status === 'progress' && typeof p.progress === 'number' && p.file) {
          fileProg[p.file] = p.progress;
          const vals = Object.values(fileProg);
          onProgress(Math.min(0.99, vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length) / 100));
        } else if (p.status === 'ready') onProgress(1);
      },
    });
  })();
  return _enginePromise;
}

/** Run one conductor turn (plan/rank/fix). Returns the model's text. */
export async function conductorChat(
  cfg: ConductorEngineCfg,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; onProgress?: (p: number) => void } = {},
): Promise<string> {
  const pipe = await loadEngine(cfg, opts.onProgress);
  const temperature = opts.temperature ?? 0.2;
  const res: any = await pipe(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      max_new_tokens: Math.min(opts.maxTokens ?? 360, 768),
      do_sample: temperature > 0,
      temperature: temperature > 0 ? Math.max(0.1, temperature) : undefined,
      top_p: temperature > 0 ? 0.9 : undefined,
      repetition_penalty: 1.1,
      return_full_text: false,
    },
  );
  // transformers.js returns [{ generated_text: [...turns] | string }]
  const first = Array.isArray(res) ? res[0] : res;
  const gt = first?.generated_text ?? first;
  if (typeof gt === 'string') return gt.trim();
  if (Array.isArray(gt)) { const last = gt[gt.length - 1]; return typeof last?.content === 'string' ? last.content.trim() : ''; }
  return '';
}
