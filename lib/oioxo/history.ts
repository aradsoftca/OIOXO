/**
 * oioxo Code — PROJECT HISTORY (weak-device "work on it later, never lose work"
 * gem). sessions.ts keeps the CURRENT project; this keeps its TIMELINE — a capped
 * list of snapshots so you can roll back to any working version, especially the
 * verified-GREEN milestones the loop produced. Old devices crash/close tabs; a
 * product you can't recover isn't a product. Snapshots are deduped (no-op edits
 * don't pile up) and milestones (green/manual/scaffold) are never pruned.
 *
 * Pure core (Node-tested) + an IndexedDB store mirroring sessions.ts (no-op in
 * SSR/Node, never throws).
 */
import type { CodeFile } from './codeloop';

export type SnapReason = 'scaffold' | 'edit' | 'green' | 'manual';

export interface Snapshot {
  id: string;
  ts: number;
  reason: SnapReason;
  label: string;
  files: CodeFile[];
}

/** A stable content hash of the whole file set (dedupe identical states). */
export function filesHash(files: CodeFile[]): string {
  const norm = [...files].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => f.path + '\0' + f.content).join('\0\0');
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + norm.length;
}

export const sameFiles = (a: CodeFile[], b: CodeFile[]): boolean => filesHash(a) === filesHash(b);

export function makeSnapshot(reason: SnapReason, label: string, files: CodeFile[]): Snapshot {
  return { id: 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), reason, label, files: files.map((f) => ({ ...f })) };
}

/** File paths that differ (added / removed / changed) between two snapshots. */
export function changedPaths(a: CodeFile[], b: CodeFile[]): string[] {
  const ma = new Map(a.map((f) => [f.path, f.content]));
  const mb = new Map(b.map((f) => [f.path, f.content]));
  const out = new Set<string>();
  for (const [p, c] of mb) if (ma.get(p) !== c) out.add(p);
  for (const p of ma.keys()) if (!mb.has(p)) out.add(p);
  return [...out];
}

/**
 * Append a snapshot to the timeline, with two disciplines that keep history small
 * but never lose a working version:
 *  - DEDUPE: if the files are identical to the latest snapshot, keep the better
 *    reason (a green/manual milestone outranks an edit) but don't add a row.
 *  - PRUNE: keep EVERY milestone (scaffold/green/manual) + only the most recent
 *    `maxEdits` plain edits (the oldest edits fall away first).
 */
export function addToHistory(list: Snapshot[], snap: Snapshot, maxEdits = 25): Snapshot[] {
  const rank: Record<SnapReason, number> = { edit: 0, scaffold: 1, manual: 2, green: 2 };
  const last = list[list.length - 1];
  let next: Snapshot[];
  if (last && filesHash(last.files) === filesHash(snap.files)) {
    // Same state — upgrade the existing row's reason/label if the new one matters more.
    if (rank[snap.reason] > rank[last.reason]) list = [...list.slice(0, -1), { ...last, reason: snap.reason, label: snap.label, ts: snap.ts }];
    next = list;
  } else {
    next = [...list, snap];
  }
  // Prune plain edits beyond the cap; milestones are always kept.
  const edits = next.filter((s) => s.reason === 'edit');
  if (edits.length > maxEdits) {
    const dropIds = new Set(edits.slice(0, edits.length - maxEdits).map((s) => s.id));
    next = next.filter((s) => !dropIds.has(s.id));
  }
  return next;
}

/** The latest verified-green snapshot (the "last working version" to roll back to). */
export function lastGreen(list: Snapshot[]): Snapshot | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].reason === 'green') return list[i];
  return undefined;
}

/* ── IndexedDB store (browser; no-op in Node) ──────────────────────────────── */
const DB_NAME = 'oioxo-history';
const STORE = 'timelines';
const hasIDB = (): boolean => typeof indexedDB !== 'undefined';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'projectId' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadHistory(projectId: string): Promise<Snapshot[]> {
  if (!hasIDB()) return [];
  try {
    const db = await open();
    const rec = await new Promise<{ projectId: string; snapshots: Snapshot[] } | null>((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(projectId);
      r.onsuccess = () => resolve((r.result as { projectId: string; snapshots: Snapshot[] }) ?? null);
      r.onerror = () => resolve(null);
    });
    return rec?.snapshots ?? [];
  } catch { return []; }
}

async function saveHistory(projectId: string, snapshots: Snapshot[]): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ projectId, snapshots });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

/** Record a snapshot for a project (load → dedupe/prune → save). Returns the new
 *  timeline. Safe to call on every edit + every verified-green step. */
export async function recordSnapshot(projectId: string, reason: SnapReason, label: string, files: CodeFile[]): Promise<Snapshot[]> {
  if (!files.length) return loadHistory(projectId);
  const list = addToHistory(await loadHistory(projectId), makeSnapshot(reason, label, files));
  await saveHistory(projectId, list);
  return list;
}

export async function clearHistory(projectId: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(projectId);
      tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}
