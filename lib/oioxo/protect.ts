/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo licensing (LICENSE.md §3–5) — protected Pro assets. The conductor weights,
 * prompt programs and orchestration recipes ship ENCRYPTED; they decrypt only with
 * a content key the server hands out per valid session. No key → no asset → no Pro
 * brain, with NO fallback. This is the only robust gate: you can't patch your way
 * to data you were never sent.
 *
 * Per-user key derivation (HKDF) means each account's assets are keyed to them, so
 * a leaked KEY traces back to a user (and is revocable). Isomorphic (WebCrypto),
 * pure, Node-testable. (Tracing a leaked *decrypted* weight file is a model-level
 * watermark — a separate ML-track concern; here we secure delivery + key custody.)
 */

const enc = new TextEncoder();

/** Coerce a Uint8Array to BufferSource for WebCrypto (see entitlement.ts). */
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64FromBytes(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function bytesFromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** A fresh 256-bit content key (server-side; rotated per release). */
export function randomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function aesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bs(raw), { name: 'AES-GCM' }, false, usage);
}

export interface EncBlob {
  /** AES-GCM IV (96-bit), base64. */
  iv: string;
  /** Ciphertext + tag, base64. */
  ct: string;
  /** Optional traceability marker (which user this ciphertext was minted for). */
  tag?: string;
}

/** Encrypt an asset with a content key (AES-256-GCM). */
export async function encryptAsset(plaintext: Uint8Array, key: Uint8Array, tag?: string): Promise<EncBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, await aesKey(key, ['encrypt']), bs(plaintext));
  return { iv: b64FromBytes(iv), ct: b64FromBytes(new Uint8Array(ct)), tag };
}

/** Decrypt an asset. Throws if the key is wrong or the blob was tampered (GCM auth
 *  tag fails) — there is intentionally no fallback path. */
export async function decryptAsset(blob: EncBlob, key: Uint8Array): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bs(bytesFromB64(blob.iv)) },
    await aesKey(key, ['decrypt']),
    bs(bytesFromB64(blob.ct)),
  );
  return new Uint8Array(pt);
}

/**
 * Derive a per-user content key from the master key (HKDF-SHA256). Deterministic
 * for a given (master, userId, release) so the server can re-derive it, but unique
 * per user → a leaked key identifies the account. `release` rotates all keys.
 */
export async function deriveUserKey(master: Uint8Array, userId: string, release = 'v1'): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', bs(master), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`oioxo:${release}`), info: enc.encode(`user:${userId}`) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** A short, stable traceability marker for a user (HMAC(master, userId)) — stored
 *  with their per-user ciphertext so a leaked blob/key points back to the account. */
export async function userTag(master: Uint8Array, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', bs(master), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(`user:${userId}`));
  return toHex(new Uint8Array(sig).slice(0, 8));
}

/** Mint a user-specific encrypted asset: derive their key, tag it, encrypt. The
 *  server stores/serves this; only that user's key (re-derived or delivered) opens
 *  it, and the tag tells us whose copy leaked. */
export async function encryptForUser(plaintext: Uint8Array, master: Uint8Array, userId: string, release = 'v1'): Promise<EncBlob> {
  const key = await deriveUserKey(master, userId, release);
  return encryptAsset(plaintext, key, await userTag(master, userId));
}

/** Base64 helpers for transporting a raw content key (e.g. over the entitlement
 *  response). The key itself never ships inside the app bundle. */
export const keyToB64 = (k: Uint8Array): string => b64FromBytes(k);
export const keyFromB64 = (s: string): Uint8Array => bytesFromB64(s);
