/**
 * Xonvert AI — on-device answer cache (the "magic" layer).
 *
 * Every web answer is stored in IndexedDB with its sentence embedding. A later
 * question that *means* the same thing — even worded completely differently
 * ("how tall is the Eiffel Tower" vs "Eiffel Tower height") — matches by cosine
 * similarity and is served instantly, with NO network call. So each device
 * quietly builds its own private knowledge base that gets faster and more
 * offline-capable the more it's used. This is also the substrate for "recent
 * searches": the cache *is* the history, semantically searchable.
 *
 * Degrades gracefully everywhere: no IndexedDB (SSR/Node) → no-op; embedder not
 * warm yet → exact-match only; any error → miss (caller just hits the network).
 */

import type { SearchAnswer } from './search';
import { embedText } from './embed';

const DB_NAME = 'xonvert-search';
const STORE = 'answers';
const SIM_THRESHOLD = 0.9;   // cosine; below this we don't trust the cache hit
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // facts go stale slowly — a week
const MAX_ENTRIES = 500;

interface CacheRec {
  q: string;            // normalized query (also the key)
  display: string;      // the cleaned query as shown
  vec: number[] | null; // embedding, when available
  answer: SearchAnswer;
  ts: number;
}

function normalize(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'q' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allRecs(): Promise<CacheRec[]> {
  if (!hasIDB()) return [];
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve((r.result as CacheRec[]) ?? []);
      r.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function putRec(rec: CacheRec): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

async function deleteRecs(keys: string[]): Promise<void> {
  if (!hasIDB() || !keys.length) return;
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    for (const k of keys) tx.objectStore(STORE).delete(k);
  } catch { /* ignore */ }
}

function cosine(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0; // both stored normalized, so dot == cosine
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Look up an answer for `text` on-device. Tries an exact normalized match, then
 * a semantic match (if the embedder is warm). Returns the answer (flagged
 * cached) or null on a miss. Never throws.
 */
export async function getCached(text: string): Promise<SearchAnswer | null> {
  if (!hasIDB()) return null;
  const norm = normalize(text);
  if (!norm) return null;
  const recs = await allRecs();
  if (!recs.length) return null;
  const now = Date.now();
  const fresh = recs.filter((r) => now - r.ts < MAX_AGE_MS);

  // Exact normalized hit — cheapest, no embedding needed.
  const exact = fresh.find((r) => r.q === norm);
  if (exact) return { ...exact.answer, cached: true };

  // Semantic hit — only if the embedder is already warm (else stay instant).
  const qv = await embedText(text);
  if (!qv) return null;
  let best: CacheRec | null = null;
  let bestScore = SIM_THRESHOLD;
  for (const r of fresh) {
    if (!r.vec || r.vec.length !== qv.length) continue;
    const s = cosine(qv, r.vec);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best ? { ...best.answer, cached: true } : null;
}

/**
 * Store an answer for later reuse. Skips volatile answers (weather, rates) and
 * empty/disambiguation results. Prunes the oldest entries past the cap.
 */
export async function putCached(text: string, answer: SearchAnswer, opts?: { volatile?: boolean }): Promise<void> {
  if (!hasIDB() || opts?.volatile || !answer.answer) return;
  const norm = normalize(text);
  if (!norm) return;
  const vec = await embedText(text);
  const clean: SearchAnswer = { answer: answer.answer, query: answer.query, sources: answer.sources, related: answer.related };
  await putRec({ q: norm, display: answer.query, vec: vec ? Array.from(vec) : null, answer: clean, ts: Date.now() });

  // Prune: keep the most recent MAX_ENTRIES.
  const recs = await allRecs();
  if (recs.length > MAX_ENTRIES) {
    recs.sort((a, b) => b.ts - a.ts);
    await deleteRecs(recs.slice(MAX_ENTRIES).map((r) => r.q));
  }
}

/** Most recently asked queries, newest first — the live "recent searches". */
export async function recentSearches(n = 8): Promise<{ query: string; ts: number }[]> {
  const recs = await allRecs();
  return recs.sort((a, b) => b.ts - a.ts).slice(0, n).map((r) => ({ query: r.display || r.q, ts: r.ts }));
}

/** Wipe the on-device answer cache (privacy / "clear history"). */
export async function clearSearchCache(): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch { /* ignore */ }
}
