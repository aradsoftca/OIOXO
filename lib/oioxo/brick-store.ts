/**
 * oioxo Code — the on-device BRICK CORPUS store. Holds verified code units in
 * IndexedDB (seed + harvested-from-green-builds), retrieves the relevant ones for
 * a new task, and grows as the device builds. Mirrors trajectory-store.ts exactly
 * (same IDB pattern, dedupe-by-content, cap + evict, no-op in SSR/Node, never
 * throws). The retrieval digest is folded into the coder's DRAFT prompt so a weak
 * model adapts proven blocks instead of authoring from nothing.
 *
 * Private by default (stays on the device); the corpus is exportable + shareable
 * over the P2P Send stack so devices pool their verified blocks.
 */
import type { CodeFile } from './codeloop';
import {
  type Brick,
  SEED_BRICKS,
  matchBricks,
  semanticMatchBricks,
  renderBricksForPrompt,
  brickFromVerifiedBuild,
  revalidateForImport,
} from './bricks';
import { LIBRARY_BRICKS } from './brick-library';

// The seeded base corpus = the core bricks + the curated verified library (the
// cold-start shelves). Used to seed IndexedDB and as the in-memory fallback (Node,
// first run) so semantic/lexical recall has stock before the network grows.
const BASE_CORPUS: Brick[] = [...SEED_BRICKS, ...LIBRARY_BRICKS];

const DB_NAME = 'oioxo-bricks';
const STORE = 'bricks';
const MAX_ENTRIES = 2000;

const hasIDB = (): boolean => typeof indexedDB !== 'undefined';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Add bricks (deduped by id = content hash). Returns how many were newly added. */
export async function addBricks(bricks: Brick[]): Promise<number> {
  if (!hasIDB() || !bricks.length) return 0;
  try {
    const db = await open();
    const existing = new Set(await allKeys(db));
    const fresh = bricks.filter((b) => !existing.has(b.id));
    if (!fresh.length) return 0;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      for (const b of fresh) os.put(b);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await evictIfNeeded(db);
    return fresh.length;
  } catch { return 0; }
}

function allKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve((r.result as string[]) ?? []);
    r.onerror = () => resolve([]);
  });
}

async function allBricks(): Promise<Brick[]> {
  if (!hasIDB()) return [];
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve((r.result as Brick[]) ?? []);
      r.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  const recs = await new Promise<Brick[]>((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => resolve((r.result as Brick[]) ?? []);
    r.onerror = () => resolve([]);
  });
  if (recs.length <= MAX_ENTRIES) return;
  // Keep seeds + the most recent harvested; drop oldest harvested first.
  const drop = recs
    .filter((b) => b.origin !== 'seed')
    .sort((a, b) => a.ts - b.ts)
    .slice(0, recs.length - MAX_ENTRIES)
    .map((b) => b.id);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const id of drop) tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

let seeded = false;
/** Ensure the seed corpus is present (once per session). Cheap + idempotent. */
export async function ensureSeeded(): Promise<void> {
  if (seeded || !hasIDB()) return;
  seeded = true;
  await addBricks(BASE_CORPUS).catch(() => {});
}

/**
 * The retrieval digest for a task: the relevant verified bricks rendered for the
 * prompt. Searches the stored corpus (seed + harvested); falls back to the
 * in-memory SEED_BRICKS so it works before/without IndexedDB (Node, first run).
 * Empty string when nothing is relevant — so it never bloats an unrelated draft.
 */
export async function recallBricks(query: string, n = 3): Promise<string> {
  if (!query) return '';
  await ensureSeeded();
  const corpus = (await allBricks());
  const hits = matchBricks(query, corpus.length ? corpus : BASE_CORPUS, n);
  return renderBricksForPrompt(hits);
}

// One process-lifetime vector cache so the corpus is embedded once (embed.ts).
const _vecCache = new Map<string, number[]>();

/**
 * SEMANTIC recall (the "any device" keystone): finds the right verified block for a
 * VAGUE request that token-overlap misses, using the tiny on-device embedder. Lazy-
 * loads MiniLM on first use (cached); falls back to lexical recall if the embedder
 * can't load. The corpus is the weak device's catalog of the network's proven work.
 */
export async function recallBricksSemantic(query: string, n = 3): Promise<string> {
  if (!query) return '';
  await ensureSeeded();
  const corpus = await allBricks();
  const pool = corpus.length ? corpus : BASE_CORPUS;
  try {
    const { loadEmbedder } = await import('./embed');
    const embed = await loadEmbedder();
    const hits = await semanticMatchBricks(query, embed, pool, n, _vecCache);
    if (hits.length) return renderBricksForPrompt(hits);
  } catch { /* embedder unavailable → lexical fallback below */ }
  return renderBricksForPrompt(matchBricks(query, pool, n));
}

/**
 * Harvest a green build into the corpus. Called after a verified loop run; no-ops
 * in Node/SSR and never throws, so wiring it into the build path is safe.
 */
export async function rememberVerifiedBuild(goal: string, files: CodeFile[]): Promise<number> {
  const brick = brickFromVerifiedBuild(goal, files);
  if (!brick) return 0;
  return addBricks([brick]);
}

/**
 * Import bricks received from a peer (brick-share.receiveBricks). Each is RE-PROVEN
 * by this device's oracle (revalidateForImport) before being stored — a peer's
 * "verified" claim is never trusted. Returns what was adopted vs rejected so the
 * UI can show "added N proven blocks, skipped M unverifiable". Safe + no-op in Node
 * persistence (revalidation still runs; addBricks just no-ops without IndexedDB).
 */
export async function importSharedBricks(
  incoming: Brick[],
  libFiles?: Map<string, string>,
): Promise<{ added: number; accepted: number; rejected: number; rejections: { title: string; reason: string }[] }> {
  const { accepted, rejected } = await revalidateForImport(incoming, libFiles);
  const added = await addBricks(accepted);
  return { added, accepted: accepted.length, rejected: rejected.length, rejections: rejected.map((r) => ({ title: r.title, reason: r.reason })) };
}

/** The verified bricks this device can share with a peer (seed + everything it has
 *  harvested/imported). Receivers re-prove them, so sharing seeds too is harmless. */
export async function getShareableBricks(): Promise<Brick[]> {
  await ensureSeeded();
  return (await allBricks()).filter((b) => b.verified);
}

export async function brickStats(): Promise<{ total: number; byOrigin: Record<string, number> }> {
  const recs = await allBricks();
  const byOrigin: Record<string, number> = {};
  for (const b of recs) byOrigin[b.origin] = (byOrigin[b.origin] ?? 0) + 1;
  return { total: recs.length, byOrigin };
}

export async function clearBricks(): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    seeded = false;
  } catch { /* ignore */ }
}
