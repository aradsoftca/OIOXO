/**
 * oioxo Compute Mesh — DEVICE KEY PERSISTENCE (stage 8 binding). The account-bound
 * device identity (device-key.ts) must survive reloads, so the device keeps a stable id
 * + signing key. We store it in IndexedDB: the PRIVATE key is a non-extractable
 * CryptoKey (structured-clone stores the handle without ever exposing the bytes — it
 * can sign but can't be read out), the public JWK + id ride alongside for registration.
 *
 * Browser-only. `loadOrCreateIdentity()` is the single entry point the app calls once at
 * startup; it returns the same shape as createDeviceIdentity (incl. a ready `sign`).
 */
import { toB64Url, fromB64Url } from './bytes';
import { createDeviceIdentity, type DeviceIdentity } from './device-key';

const DB_NAME = 'oioxo-mesh';
const STORE = 'identity';
const SELF = 'self';

interface StoredIdentity {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey; // non-extractable handle; survives structured clone
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Rebuild a signer over a stored (non-extractable) private key. */
function signerFor(privateKey: CryptoKey): DeviceIdentity['sign'] {
  return async (canonical) =>
    toB64Url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(canonical)));
}

/**
 * Return this device's persistent identity, creating + storing it on first run. The
 * private key never leaves the device (non-extractable). Falls back to an ephemeral
 * in-memory identity if IndexedDB is unavailable (private mode) — pairing still works,
 * the id just won't persist across reloads.
 */
export async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  try {
    const db = await openDb();
    const stored = await tx<StoredIdentity | undefined>(db, 'readonly', (s) => s.get(SELF));
    if (stored?.privateKey && stored.deviceId) {
      return { deviceId: stored.deviceId, publicKeyJwk: stored.publicKeyJwk, privateKey: stored.privateKey, sign: signerFor(stored.privateKey) };
    }
    const id = await createDeviceIdentity(false); // non-extractable private key
    await tx(db, 'readwrite', (s) => s.put({ deviceId: id.deviceId, publicKeyJwk: id.publicKeyJwk, privateKey: id.privateKey } satisfies StoredIdentity, SELF));
    return id;
  } catch {
    return createDeviceIdentity(false); // ephemeral fallback
  }
}

/** Wipe the stored identity (e.g. on sign-out / "forget this device"). */
export async function clearIdentity(): Promise<void> {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(SELF));
  } catch { /* nothing to clear */ }
}

// Re-export so callers can decode a peer's registered key id without importing two modules.
export { fromB64Url };
