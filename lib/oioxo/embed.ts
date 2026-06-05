/**
 * oioxo Code — SEMANTIC RETRIEVAL (the "any device" keystone). The verified-program
 * corpus is only useful if a weak device can FIND the right program for a vague
 * request — token-overlap can't ("delay until the user stops typing" never matches
 * "debounce"). So we embed with a TINY sentence model that runs on CPU
 * (all-MiniLM-L6-v2, ~22M params, in transformers.js — browser + Node) and rank by
 * cosine. The model is cheap enough for an old PC, and embeddings cache so the
 * corpus is embedded once. Blended with the existing lexical overlap (semantic
 * catches meaning, lexical catches exact names) for the best of both.
 *
 * The ranking math is PURE + Node-testable with a fake embedder; only loadEmbedder
 * needs the model. EmbedFn is injectable everywhere so callers/tests control it.
 */
import { overlapScore } from './trajectory-store';

/** Embed a batch of texts → one vector each (caller-injectable; tests fake it). */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

/** Cosine similarity. (MiniLM is mean-pooled + normalized, so this ≈ dot product,
 *  but we normalize defensively so any embedder works.) */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Ranked<T> { item: T; score: number; semantic: number; lexical: number }

/**
 * Rank items against a query by SEMANTIC similarity, blended with the lexical
 * overlap of `lexOf` (default 0.7 semantic / 0.3 lexical). `vecCache` keeps item
 * embeddings across calls (embed the corpus once). Pure given `embed`.
 */
export async function semanticRank<T>(
  query: string,
  items: T[],
  embedOf: (t: T) => string,
  embed: EmbedFn,
  opts: { k?: number; min?: number; alpha?: number; lexOf?: (t: T) => string; vecCache?: Map<string, number[]> } = {},
): Promise<Ranked<T>[]> {
  if (!query || !items.length) return [];
  const k = opts.k ?? 5;
  const min = opts.min ?? 0.15;
  const alpha = opts.alpha ?? 0.7; // weight on semantic vs lexical
  const cache = opts.vecCache;

  const texts = items.map(embedOf);
  // Embed only the texts we haven't embedded before (corpus embedded once).
  const missing = cache ? [...new Set(texts.filter((t) => !cache.has(t)))] : texts;
  let fresh: number[][] = [];
  if (missing.length) fresh = await embed(missing);
  if (cache) missing.forEach((t, i) => cache.set(t, fresh[i]));
  const itemVecs = cache ? texts.map((t) => cache.get(t)!) : fresh;

  const [qv] = await embed([query]);
  const lex = opts.lexOf;
  return items
    .map((item, i): Ranked<T> => {
      const semantic = cosine(qv, itemVecs[i]);
      const lexical = lex ? overlapScore(query, lex(item)) : 0;
      const score = lex ? alpha * semantic + (1 - alpha) * lexical : semantic;
      return { item, score, semantic, lexical };
    })
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/* ── The on-device embedder (transformers.js MiniLM; browser + Node) ──────────── */
let _embedder: Promise<EmbedFn> | null = null;

/** Load (once, cached) a tiny CPU sentence embedder. Tries the v3 package, then v2;
 *  weights (~90MB) download once then run offline. Returns an EmbedFn. */
export function loadEmbedder(model = 'Xenova/all-MiniLM-L6-v2'): Promise<EmbedFn> {
  _embedder ??= (async (): Promise<EmbedFn> => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let tf: any;
    try { tf = await import('@huggingface/transformers'); }
    catch { tf = await import('@xenova/transformers'); }
    if (tf.env) tf.env.allowRemoteModels = true;
    let pipe: any;
    try { pipe = await tf.pipeline('feature-extraction', model, { dtype: 'q8' }); }
    catch { pipe = await tf.pipeline('feature-extraction', model, { quantized: true }); }
    return async (texts: string[]): Promise<number[][]> => {
      const out = await pipe(texts, { pooling: 'mean', normalize: true });
      const arr = typeof out?.tolist === 'function' ? out.tolist() : out;
      // [n, dim] nested array
      return Array.isArray(arr[0]) ? (arr as number[][]) : [arr as unknown as number[]];
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })();
  return _embedder;
}
