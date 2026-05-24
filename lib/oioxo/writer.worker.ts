/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Persistent WRITER worker — runs the q4 model OFF the main thread so generation
 * never freezes the UI, and on WebGPU (fast) with a WASM fallback. Loads the
 * model once, then serves generate requests. lib/oioxo/writer.ts is the client.
 *
 * Message in:  { id, prompt, maxNew }
 * Message out: { id, text }  or  { id, error }  or  { type:'backend', backend }
 */
const MODEL = 'payam1394/oioxo-writer8';
let _pipe: Promise<any> | null = null;

async function getPipe(): Promise<any> {
  _pipe ??= (async () => {
    const lib: any = await import('@huggingface/transformers');
    try {
      lib.env.allowLocalModels = false;
      lib.env.allowRemoteModels = true;
    } catch {
      /* env shape differs across versions */
    }
    // WebGPU fast path → WASM fallback. Same weights, same quality.
    for (const device of ['webgpu', 'wasm'] as const) {
      try {
        const pipe = await lib.pipeline('text-generation', MODEL, { dtype: 'q4', device });
        (self as any).postMessage({ type: 'backend', backend: device });
        return pipe;
      } catch (e) {
        if (device === 'wasm') throw e; // both failed → surface it
      }
    }
  })();
  return _pipe;
}

function extractText(res: any): string {
  if (typeof res === 'string') return res.trim();
  if (Array.isArray(res)) {
    const first = res[0];
    const gt = first?.generated_text ?? first;
    if (typeof gt === 'string') return gt.trim();
    if (Array.isArray(gt)) {
      const last = gt[gt.length - 1];
      return typeof last?.content === 'string' ? last.content.trim() : '';
    }
  }
  return '';
}

self.onmessage = async (e: MessageEvent) => {
  const { id, prompt, maxNew } = (e.data || {}) as { id: number; prompt: string; maxNew: number };
  try {
    const pipe = await getPipe();
    const res = await pipe([{ role: 'user', content: prompt }], {
      max_new_tokens: maxNew,
      do_sample: false,
      // Forbid repeating any 3-gram → kills "a good diet is a good diet" loops
      // without the rep-penalty that backfired (incoherence) before.
      no_repeat_ngram_size: 3,
    });
    (self as any).postMessage({ id, text: extractText(res) });
  } catch (err: any) {
    (self as any).postMessage({ id, error: String(err?.message || err) });
  }
};
