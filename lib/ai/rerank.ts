/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * rerank — the answer-bearing RERANKER (oioxo encoder head #1, trained on arad).
 *
 * A MiniLM cross-encoder fine-tuned (cross-encoder/ms-marco-MiniLM-L-6-v2 +
 * Gemini-distilled answer-bearing labels over our real gather) that scores
 * (question × passage) for "does this passage ANSWER the question". The battery
 * showed bi-encoder cosine selects topical-but-not-answering passages (sky-blue-
 * the-color, ACT-not-Canberra, gym-leaders); this fixes selection across classes.
 *
 * Weights live ENCRYPTED on Hugging Face (payam1394/oioxo-reranker, int8 ~23MB) —
 * HF stores only ciphertext it can't read; the decrypt key is minted per-session
 * by our origin (/api/ai-key). HF serves the heavy bytes + public metadata; we
 * serve nothing but the key. Degrades gracefully: can't load → callers keep
 * cosine order. (Node/dev still loads plaintext from gitignored _models_plain/.)
 */
// transformers.js model path on HF (config/tokenizer load from here directly).
const HF_REPO = 'payam1394/oioxo-reranker';
// Local model id used in Node/dev (plaintext under _models_plain/) AND as the
// stable ENTITLEMENT asset id for the key handshake — the AES key is derived from
// this, so it must stay 'models/oioxo-reranker' no matter where the bytes live.
const ASSET_ID = 'models/oioxo-reranker';
const isBrowser = typeof window !== 'undefined';

let _ready: Promise<{ tok: any; model: any } | null> | null = null;

async function load(): Promise<{ tok: any; model: any } | null> {
  if (_ready) return _ready;
  const p = (async () => {
    try {
      const lib: any = await import('@xenova/transformers');
      const MODEL = isBrowser ? HF_REPO : ASSET_ID;
      if (isBrowser) {
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        // config/tokenizer load straight from HF (public); the ONNX weights are the
        // only encrypted file and we prime them into cache below before from_pretrained.
        lib.env.remoteHost = 'https://huggingface.co';
        lib.env.remotePathTemplate = '{model}/resolve/{revision}/';
        // HARD GATE ("permission IS the key"): the weights ship AES-GCM encrypted on
        // HF (only model_quantized.onnx.enc exists there — HF can't read it).
        // loadProtectedModel runs the device-bound entitlement → per-session ECDHE
        // handshake against /api/ai-key (bound to ASSET_ID, not the HF path), fetches
        // the .enc from HF, decrypts in-memory, and primes the transformers.js cache
        // under the exact resolve URL — so the next from_pretrained finds the plaintext
        // bytes (cache hit) and nothing readable ever crosses the wire. No live session
        // → it throws → reranker stays off (callers keep cosine order). Free-tier OK.
        const { loadProtectedModel } = await import('../oioxo/protected-model');
        await loadProtectedModel({
          modelId: HF_REPO,
          host: lib.env.remoteHost,
          assetId: ASSET_ID,
          onnxUrl: `https://huggingface.co/${HF_REPO}/resolve/main/onnx/model_quantized.onnx`,
          keyEndpoint: '/api/ai-key',
        });
      } else {
        // Node (eval/dev): plaintext lives only in the gitignored _models_plain/ dir
        // (never served). Production serves only the .enc + this gate.
        lib.env.allowRemoteModels = false;
        lib.env.allowLocalModels = true;
        lib.env.localModelPath = (typeof process !== 'undefined' ? process.cwd() : '.') + '/_models_plain';
      }
      const tok = await lib.AutoTokenizer.from_pretrained(MODEL);
      const model = await lib.AutoModelForSequenceClassification.from_pretrained(MODEL, { quantized: true });
      return { tok, model };
    } catch {
      return null; // graceful: caller keeps existing order (no live session / model)
    }
  })();
  _ready = p;
  // Same drop-on-null/reject pattern as the other model loaders — a transient
  // /api/ai-key blip would otherwise leave the reranker permanently off.
  p.then((v) => { if (v == null && _ready === p) _ready = null; })
   .catch(() => { if (_ready === p) _ready = null; });
  return p;
}

/** Whether the reranker is available (loaded ok). */
export async function rerankerReady(): Promise<boolean> {
  return (await load()) != null;
}

/**
 * Score each passage for answer-bearing relevance to `query` (higher = better).
 * Batched. Returns one score per passage, or null if the model isn't available.
 */
export async function scorePassages(query: string, passages: string[]): Promise<number[] | null> {
  if (!passages.length) return [];
  const r = await load();
  if (!r) return null;
  try {
    const out: number[] = [];
    const B = 16;
    for (let i = 0; i < passages.length; i += B) {
      const batch = passages.slice(i, i + B);
      const enc = await r.tok(batch.map(() => query), { text_pair: batch, padding: true, truncation: true, max_length: 256 });
      const res: any = await r.model(enc);
      const data: ArrayLike<number> = res.logits.data;
      const rows = batch.length;
      const cols = data.length / rows;
      for (let j = 0; j < rows; j++) out.push(Number(data[j * cols])); // single relevance logit
    }
    return out;
  } catch {
    return null;
  }
}

export interface Scored<T> { item: T; score: number }

/**
 * Rerank items by a passage extracted from each. Returns items sorted by
 * answer-bearing relevance (desc). Falls back to the original order if the model
 * isn't available. `getText` pulls the passage text from each item.
 */
export async function rerank<T>(query: string, items: T[], getText: (t: T) => string): Promise<T[]> {
  if (items.length < 2) return items;
  const scores = await scorePassages(query, items.map(getText));
  if (!scores) return items; // graceful
  return items
    .map((item, i) => ({ item, score: scores[i] ?? -Infinity }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
