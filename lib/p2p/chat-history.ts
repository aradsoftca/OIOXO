'use client';
/**
 * Encrypted-at-rest chat history for the P2P chat app.
 *
 * Chat messages used to live only in React state, so a refresh or accidental
 * tab close wiped the entire conversation — the single worst gap vs Signal /
 * Telegram / WhatsApp, which all keep local history. This persists text /
 * reaction / pin messages (NOT large file blobs — those are ephemeral object
 * URLs) to IndexedDB, keyed by room + channel, and reloads them on mount.
 *
 * Encrypted at rest: the record is AES-256-GCM encrypted with a key DERIVED
 * FROM THE ROOM CODE (the shared secret already in the invite link). This keeps
 * the conversation out of plaintext on disk without introducing any new secret
 * or server round-trip — anyone with the link can already read the chat, which
 * is exactly the app's existing trust model. PBKDF2 binds the key to the room
 * so one room's history can't decrypt another's.
 *
 * Retention: records carry a timestamp; loadHistory() drops anything older than
 * the caller's retention window (Pro keeps longer than free) before returning,
 * and pruneHistory() can be called to physically delete expired rooms.
 */

const DB_NAME = 'xonvert-chat';
const STORE = 'history';
const SCHEMA = 1;
const MAX_MESSAGES = 2000; // cap per room/channel so a long-lived room can't grow unbounded

/** A persisted message — the serializable subset of the UI's RichMsg. File
 *  messages are stored as a lightweight placeholder (no bytes). */
export interface StoredMsg {
  id: number;
  mine: boolean;
  name: string;
  ts: number;
  kind: string;            // 'text' | 'file' | 'voice' | …
  text?: string;
  parentId?: number;
  pinned?: boolean;
  // Reactions: emoji → list of names. Kept small; large reaction sets are rare.
  reactions?: Record<string, string[]>;
  // For non-text kinds we keep metadata only (never the blob).
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
}

interface HistoryRecord {
  key: string;             // `${room}::${channel}`
  room: string;
  updatedAt: number;
  iv: number[];            // AES-GCM IV (12 bytes)
  salt: number[];          // PBKDF2 salt (16 bytes)
  data: ArrayBuffer;       // ciphertext of JSON(StoredMsg[])
  version: number;
}

let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('updatedAt', 'updatedAt');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  // Clear the cache on failure (private browsing / quota / transient) so the
  // next call retries instead of returning a permanently-rejected promise.
  p.catch(() => { dbp = null; });
  dbp = p;
  return p;
}

const keyFor = (room: string, channel: string) => `${room}::${channel}`;

// Copy bytes into a view explicitly backed by a plain ArrayBuffer so the type is
// unambiguously Uint8Array<ArrayBuffer> (a valid BufferSource), sidestepping the
// TS 5.7 ArrayBufferLike-vs-ArrayBuffer friction on WebCrypto params. A bare
// `new Uint8Array(a)` propagates the source's ArrayBufferLike type and still
// fails the BufferSource overload.
function buf(a: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(a.byteLength));
  out.set(a);
  return out;
}

async function deriveKey(room: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(`chat:${room}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Persist the current message list for a room/channel (encrypted). Trims to the
 *  most recent MAX_MESSAGES. Never throws — a storage failure must not break chat. */
export async function saveHistory(room: string, channel: string, messages: StoredMsg[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || !crypto?.subtle) return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(room, salt);
    const plain = new TextEncoder().encode(JSON.stringify(trimmed));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(plain));
    const rec: HistoryRecord = {
      key: keyFor(room, channel), room, updatedAt: Date.now(),
      iv: Array.from(iv), salt: Array.from(salt), data, version: SCHEMA,
    };
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* storage best-effort */ }
}

/** Load + decrypt a room/channel's history. Drops messages older than
 *  `retentionMs` (0 / undefined = keep all). Returns [] on any failure. */
export async function loadHistory(room: string, channel: string, retentionMs = 0): Promise<StoredMsg[]> {
  if (typeof indexedDB === 'undefined' || !crypto?.subtle) return [];
  try {
    const db = await openDb();
    const rec = await new Promise<HistoryRecord | undefined>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(keyFor(room, channel));
      req.onsuccess = () => res(req.result as HistoryRecord | undefined);
      req.onerror = () => rej(req.error);
    });
    if (!rec || rec.version !== SCHEMA) return [];
    const key = await deriveKey(room, new Uint8Array(rec.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(new Uint8Array(rec.iv)) }, key, rec.data);
    const msgs = JSON.parse(new TextDecoder().decode(plain)) as StoredMsg[];
    if (!Array.isArray(msgs)) return [];
    if (retentionMs > 0) {
      const cutoff = Date.now() - retentionMs;
      return msgs.filter((m) => (m.ts || 0) >= cutoff);
    }
    return msgs;
  } catch { return []; }
}

/** Delete one room/channel's stored history (e.g. on "Clear chat"). */
export async function clearHistory(room: string, channel: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(keyFor(room, channel));
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* */ }
}

/** Physically remove records whose last update is older than `retentionMs`.
 *  Call occasionally (e.g. on app mount) so expired conversations don't linger. */
export async function pruneHistory(retentionMs: number): Promise<void> {
  if (typeof indexedDB === 'undefined' || retentionMs <= 0) return;
  try {
    const db = await openDb();
    const cutoff = Date.now() - retentionMs;
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const idx = store.index('updatedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const cur = idx.openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { store.delete(c.primaryKey); c.continue(); }
      };
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* */ }
}
