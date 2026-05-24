/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo licensing — the no-fallback Pro-asset LOADER (LICENSE.md §3). Pro brains
 * (e.g. the fine-tuned conductor weights) ship as AES-256-GCM ciphertext on the
 * CDN and decrypt ONLY with the content key the server hands a valid Pro session
 * (entitlement-client → /api/entitlement). No key → throw; there is intentionally
 * no fallback, so a copied client without a session gets useless bytes.
 *
 * The content key is the per-release one (rotated on deploy like BRAIN_WASM_KEY),
 * so a leaked key dies on the next release. Decrypted bytes are cached in memory
 * for the session and handed to the model runtime (transformers.js / web-llm).
 */
import { getEntitlement } from './entitlement-client';
import { decryptAsset, keyFromB64, type EncBlob } from './protect';

const _cache = new Map<string, Uint8Array>();

/** Thrown when there's no entitlement key — the caller shows an upgrade prompt
 *  (NOT a fallback to an open model: the Pro asset stays locked). */
export class ProLockedError extends Error {
  constructor() { super('pro-locked'); this.name = 'ProLockedError'; }
}

/**
 * Fetch + decrypt a Pro asset. Requires a Pro entitlement (content key); throws
 * ProLockedError otherwise. Caches the decrypted bytes per URL for the session.
 */
export async function loadProtectedAsset(url: string): Promise<Uint8Array> {
  const hit = _cache.get(url);
  if (hit) return hit;
  const ent = await getEntitlement();
  if (!ent.contentKey) throw new ProLockedError();
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`asset ${r.status}`);
  const blob = (await r.json()) as EncBlob;
  const bytes = await decryptAsset(blob, keyFromB64(ent.contentKey));
  _cache.set(url, bytes);
  return bytes;
}

/** Is the Pro brain unlockable right now (a content key is in hand)? Cheap check
 *  for gating UI before attempting a (large) protected download. */
export async function canLoadPro(): Promise<boolean> {
  return !!(await getEntitlement()).contentKey;
}

/** Drop decrypted assets from memory (e.g. on sign-out). */
export function clearProtectedAssets(): void { _cache.clear(); }
