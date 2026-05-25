/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §6) — local SESSIONS. A Temp project lives in
 * the tab; without this it's gone on refresh. Here we persist projects to
 * IndexedDB so you can close the tab and resume later — private, on-device, never
 * uploaded. Mirrors the trajectory-store pattern; no-ops in SSR/Node, never throws.
 */
import type { CodeFile } from './codeloop';
import type { Template } from './scaffold';

const DB_NAME = 'oioxo-sessions';
const STORE = 'projects';
const MAX = 100;

export interface Session {
  id: string;
  name: string;
  template: Template;
  runtime?: 'node' | 'python';
  setup?: string;
  runCmd: string;
  preview: boolean;
  staticServe?: boolean;
  goal: string;
  files: CodeFile[];
  updatedAt: number;
}

const hasIDB = (): boolean => typeof indexedDB !== 'undefined';

export function newSessionId(): string {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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

/** Create/replace a session (stamps updatedAt). Prunes oldest beyond MAX. */
export async function saveSession(s: Omit<Session, 'updatedAt'>): Promise<void> {
  if (!hasIDB() || !s.files.length) return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...s, updatedAt: Date.now() } as Session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // prune oldest if over cap
    const all = await listSessions();
    if (all.length > MAX) {
      const drop = all.slice(MAX);
      const tx = db.transaction(STORE, 'readwrite');
      for (const d of drop) tx.objectStore(STORE).delete(d.id);
    }
  } catch { /* ignore */ }
}

/** All sessions, newest first. */
export async function listSessions(): Promise<Session[]> {
  if (!hasIDB()) return [];
  try {
    const db = await open();
    const all = await new Promise<Session[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as Session[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export async function loadSession(id: string): Promise<Session | null> {
  if (!hasIDB()) return null;
  try {
    const db = await open();
    return await new Promise<Session | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Session) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function deleteSession(id: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}
