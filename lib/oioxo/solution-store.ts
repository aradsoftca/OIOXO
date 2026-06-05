/**
 * oioxo Code — the SOLVED-GOAL cache (Gem 3 persistence). Stores verified
 * (goal → project) solutions in IndexedDB and recalls the closest one for a new
 * goal, so the agent can replay/warm-start instead of re-running the model.
 * Mirrors brick-store.ts exactly (dedupe by goal-id, cap+evict, no-op in
 * SSR/Node, never throws). Shareable P2P like the brick corpus.
 */
import type { CodeFile } from './codeloop';
import { type Solution, makeSolution, matchSolution } from './solutions';

const DB_NAME = 'oioxo-solutions';
const STORE = 'solutions';
const MAX_ENTRIES = 500;

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

async function allSolutions(): Promise<Solution[]> {
  if (!hasIDB()) return [];
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve((r.result as Solution[]) ?? []);
      r.onerror = () => resolve([]);
    });
  } catch { return []; }
}

/** Store/refresh the verified solution for a goal (keyed by normalized goal). */
export async function rememberSolution(goal: string, files: CodeFile[], meta?: Partial<Solution>): Promise<boolean> {
  if (!hasIDB() || !goal.trim() || !files.length) return false;
  try {
    const db = await open();
    const sol = makeSolution(goal, files, meta);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(sol);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await evictIfNeeded(db);
    return true;
  } catch { return false; }
}

async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  const recs = await new Promise<Solution[]>((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => resolve((r.result as Solution[]) ?? []);
    r.onerror = () => resolve([]);
  });
  if (recs.length <= MAX_ENTRIES) return;
  const drop = recs.sort((a, b) => a.ts - b.ts).slice(0, recs.length - MAX_ENTRIES).map((s) => s.id);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const id of drop) tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** The closest cached solution for a goal (with its similarity score), or null. */
export async function recallSolution(goal: string, min?: number): Promise<{ solution: Solution; score: number } | null> {
  if (!goal.trim()) return null;
  return matchSolution(goal, await allSolutions(), min);
}

export async function solutionStats(): Promise<{ total: number }> {
  return { total: (await allSolutions()).length };
}

export async function clearSolutions(): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}
