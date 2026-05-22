/**
 * Xonvert AI — semantic embeddings.
 *
 * A tiny sentence-embedding model (all-MiniLM-L6-v2, ~23 MB, quantised) run via
 * transformers.js — the same infra that already powers Whisper/SwinIR/SlimSAM,
 * cached once on the device. This is what lets the AI understand a request by
 * *meaning* ("make my photo smaller" ≈ resize/compress) instead of keywords,
 * so the 0.5B language model never has to do the understanding.
 *
 * Tool vectors are computed once and cached in IndexedDB; only the short user
 * query is embedded at runtime (~10 ms). Everything degrades gracefully: until
 * the matrix is ready the router just uses the lexical ranker.
 */

import { indexDocs } from './tool-index';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const CACHE_VERSION = 'v1';
const IDB_NAME = 'xonvert-ai';
const IDB_STORE = 'embeddings';

type FeatureExtractor = (text: string | string[], opts: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number[] }>;

let _extractor: FeatureExtractor | null = null;
let _matrix: { ids: string[]; data: Float32Array } | null = null;
let _warmPromise: Promise<void> | null = null;

export function isEmbeddingsReady(): boolean {
  return _matrix !== null && _extractor !== null;
}

async function getExtractor(): Promise<FeatureExtractor> {
  if (_extractor) return _extractor;
  const lib = await import('@xenova/transformers');
  lib.env.allowLocalModels = false;
  lib.env.allowRemoteModels = true;
  const { configureOnnxRuntime } = await import('@/lib/compute/concurrency');
  configureOnnxRuntime(lib);
  const pipe = await lib.pipeline('feature-extraction', MODEL_ID, { quantized: true });
  _extractor = pipe as unknown as FeatureExtractor;
  return _extractor;
}

async function embedMany(texts: string[]): Promise<Float32Array[]> {
  const ex = await getExtractor();
  const out: Float32Array[] = [];
  const BATCH = 24;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await ex(batch, { pooling: 'mean', normalize: true });
    // res.data is [batch * DIM]; slice per row.
    for (let r = 0; r < batch.length; r++) {
      out.push(res.data.slice(r * DIM, (r + 1) * DIM) as Float32Array);
    }
  }
  return out;
}

async function embedOne(text: string): Promise<Float32Array> {
  const ex = await getExtractor();
  const res = await ex(text, { pooling: 'mean', normalize: true });
  return res.data.slice(0, DIM) as Float32Array;
}

// --- IndexedDB blob cache (one record) -------------------------------------

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}
async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      const r = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// --- warmup + search -------------------------------------------------------

/**
 * Load the embedder and ensure the tool matrix exists (from cache or freshly
 * computed). Idempotent; safe to call on every page load. `onProgress` reports
 * 0..1 during a first-time compute.
 */
export function warmEmbeddings(onProgress?: (pct: number) => void): Promise<void> {
  if (_warmPromise) return _warmPromise;
  _warmPromise = (async () => {
    const docs = indexDocs();
    const ids = docs.map((d) => d.id);
    const cacheKey = `tools-${CACHE_VERSION}-${ids.length}`;

    const cached = await idbGet<{ ids: string[]; data: ArrayBuffer }>(cacheKey);
    if (cached && cached.ids.length === ids.length && cached.ids[0] === ids[0]) {
      await getExtractor(); // need it for query-time embedding
      _matrix = { ids: cached.ids, data: new Float32Array(cached.data) };
      onProgress?.(1);
      return;
    }

    // First-time compute. Embed all tool descriptions in batches.
    const vecs: Float32Array[] = [];
    const BATCH = 24;
    for (let i = 0; i < docs.length; i += BATCH) {
      const part = await embedMany(docs.slice(i, i + BATCH).map((d) => d.searchText));
      vecs.push(...part);
      onProgress?.(Math.min(1, (i + BATCH) / docs.length));
    }
    const data = new Float32Array(docs.length * DIM);
    for (let i = 0; i < vecs.length; i++) data.set(vecs[i], i * DIM);
    _matrix = { ids, data };
    await idbSet(cacheKey, { ids, data: data.buffer });
    onProgress?.(1);
  })().catch((e) => { console.error('[ai] embeddings warmup failed', e); _warmPromise = null; });
  return _warmPromise;
}

export interface SemHit { id: string; score: number }

/**
 * Cosine similarity of the query against every tool vector. Returns all hits
 * (caller blends/filters). Assumes `warmEmbeddings()` has completed; returns []
 * otherwise so callers fall back to lexical.
 */
export async function semanticRank(query: string): Promise<SemHit[]> {
  if (!_matrix) return [];
  const q = await embedOne(query);
  const { ids, data } = _matrix;
  const hits: SemHit[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    let dot = 0;
    const off = i * DIM;
    for (let k = 0; k < DIM; k++) dot += q[k] * data[off + k]; // both unit-normalised
    hits[i] = { id: ids[i], score: dot };
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}
