export type StudioKind = 'image' | 'video' | 'audio-voice' | 'audio-music' | 'pdf' | 'subtitle' | 'office';

export interface StudioProject<S = unknown> {
  id: string;
  kind: StudioKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: S;
  version: number;
}

const SCHEMA_VERSION = 1;

export function newProject<S>(kind: StudioKind, name: string, state: S): StudioProject<S> {
  const now = Date.now();
  return {
    id: `${kind}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind, name, createdAt: now, updatedAt: now, state,
    version: SCHEMA_VERSION,
  };
}

export interface UndoFrame<S> { label: string; state: S; t: number }

export class UndoStack<S> {
  private past: UndoFrame<S>[] = [];
  private future: UndoFrame<S>[] = [];
  private last = 0;
  constructor(private cap = 100, private coalesceMs = 350) {}
  push(label: string, state: S) {
    const now = Date.now();
    if (this.past.length && now - this.last < this.coalesceMs && this.past[this.past.length - 1].label === label) {
      this.past[this.past.length - 1] = { label, state, t: now };
    } else {
      this.past.push({ label, state, t: now });
      if (this.past.length > this.cap) this.past.shift();
    }
    this.future.length = 0;
    this.last = now;
  }
  undo(current: S): S | null {
    if (this.past.length < 2) return null;
    const cur = this.past.pop()!;
    this.future.push({ ...cur, state: current });
    return this.past[this.past.length - 1].state;
  }
  redo(): S | null {
    const f = this.future.pop();
    if (!f) return null;
    this.past.push(f);
    return f.state;
  }
  reset(state: S, label = 'init') {
    this.past = [{ label, state, t: Date.now() }];
    this.future = [];
  }
  canUndo() { return this.past.length > 1 }
  canRedo() { return this.future.length > 0 }
  history(): { past: string[]; future: string[] } {
    return { past: this.past.map(p => p.label), future: this.future.map(f => f.label) };
  }
}

const DB_NAME = 'xon-studios';
const STORE = 'projects';
let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('kind', 'kind');
        s.createIndex('updatedAt', 'updatedAt');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  // If the open fails (private browsing, quota exhausted, transient error),
  // CLEAR the cached promise so the next call retries. Without this, every
  // studio load/save call returned the same rejected promise forever —
  // projects appeared permanently broken even after the environment
  // recovered.
  p.catch(() => { dbp = null; });
  dbp = p;
  return p;
}

export async function saveProject<S>(p: StudioProject<S>): Promise<void> {
  const db = await openDb();
  p.updatedAt = Date.now();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(p);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadProject<S>(id: string): Promise<StudioProject<S> | null> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => rej(req.error);
  });
}

export async function listProjects(kind?: StudioKind): Promise<StudioProject[]> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = req.result as StudioProject[];
      all.sort((a, b) => b.updatedAt - a.updatedAt);
      res(kind ? all.filter(p => p.kind === kind) : all);
    };
    req.onerror = () => rej(req.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
