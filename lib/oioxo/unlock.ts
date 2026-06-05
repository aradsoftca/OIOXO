/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo licensing — SESSION UNLOCK (the "hard like a rock" gate). The model + corpus
 * ship ENCRYPTED (protect.ts). To use them the device must, EVERY session, complete
 * a fresh ephemeral key exchange with the server, and the server only plays along
 * after verifying a live, device-bound entitlement. The content key NEVER crosses
 * the wire in any reusable form — it's wrapped under a per-session ECDHE secret that
 * exists only for that handshake and is discarded after. So:
 *   • a stolen download is ciphertext (no key shipped),
 *   • a captured network response is useless (bound to one session's ephemeral keys,
 *     which never leave the two endpoints),
 *   • being offline / unauthorized / on the wrong device = no handshake = the model
 *     simply won't decrypt → the product does nothing without us,
 *   • the key rotates per release, so even a memory-extracted key dies at the next.
 *
 * There is no boolean to patch: "permission" IS the handshake that yields the key.
 * Isomorphic WebCrypto (ECDH P-256 + HKDF + AES-GCM), pure + Node-testable.
 */
import { decryptAsset, encryptAsset, type EncBlob } from './protect';
import { verifyEntitlement } from './entitlement';

const enc = new TextEncoder();
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64(b: Uint8Array): string { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function unb64(s: string): Uint8Array { const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }

/** An ephemeral ECDH P-256 keypair for ONE unlock handshake. The private key is
 *  non-extractable + lives only in memory for the session, then is dropped. */
export interface Ephemeral { publicKeyB64: string; privateKey: CryptoKey; }

export async function genEphemeral(): Promise<Ephemeral> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { publicKeyB64: b64(raw), privateKey: kp.privateKey };
}

async function importPub(pubB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bs(unb64(pubB64)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

/** The shared wrapping key for this handshake: ECDH(our private, their public) →
 *  HKDF → 256-bit AES key. Both endpoints derive the SAME key; no one else can,
 *  because neither private key ever leaves its endpoint. */
async function wrapKey(privateKey: CryptoKey, peerPubB64: string, context: string): Promise<Uint8Array> {
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPub(peerPubB64) }, privateKey, 256));
  const base = await crypto.subtle.importKey('raw', bs(shared), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('oioxo:unlock'), info: enc.encode(context) }, base, 256);
  return new Uint8Array(bits);
}

/** Derive the content key the asset was encrypted with (per release). Server-side. */
export async function deriveAssetKey(master: Uint8Array, assetId: string, release = 'v1'): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', bs(master), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`oioxo:${release}`), info: enc.encode(`asset:${assetId}`) }, base, 256);
  return new Uint8Array(bits);
}

export interface UnlockRequest { entitlement: string; device: string; assetId: string; clientPubB64: string; }
export interface UnlockGrant { serverPubB64: string; wrapped: EncBlob; release: string; assetId: string; exp: number; }
export interface UnlockDenied { denied: true; reason: string; }

/**
 * SERVER: mint an unlock grant. Verifies the entitlement (signature + TTL + the
 * SAME device that's asking + the required feature), derives the asset key, and
 * returns it WRAPPED under a fresh ECDHE secret bound to the client's ephemeral
 * public key. No valid entitlement → no grant (a denial, never the key). The
 * wrapped key is only openable by the holder of the matching ephemeral private key
 * (the asking client, this session) — useless to anyone who intercepts it.
 */
export async function mintUnlock(
  req: UnlockRequest,
  opts: { secret: string; assetKey: Uint8Array; release?: string; feature?: string; ttlMs?: number; now?: number },
): Promise<UnlockGrant | UnlockDenied> {
  const now = opts.now ?? Date.now();
  const v = await verifyEntitlement(req.entitlement, opts.secret, { now, expectDevice: req.device });
  if (!v.ok) return { denied: true, reason: v.reason ?? 'unauthorized' };
  if (opts.feature && !(v.claims?.features ?? []).includes(opts.feature)) return { denied: true, reason: 'missing-feature' };

  const release = opts.release ?? 'v1';
  const assetKey = opts.assetKey; // the key the asset was encrypted with (raw env key, or deriveAssetKey)
  const eph = await genEphemeral();
  // Context binds the wrap to this exact (user, device, asset, session pubkeys) so a
  // grant can't be replayed onto a different request.
  const ctx = `${v.claims!.sub}|${req.device}|${req.assetId}|${req.clientPubB64}|${eph.publicKeyB64}`;
  const w = await wrapKey(eph.privateKey, req.clientPubB64, ctx);
  const wrapped = await encryptAsset(assetKey, w);
  // Short grant TTL (2 min) so even a captured grant dies fast. The client
  // wrapper auto-renews via /api/unlock-heartbeat (≤5 min); paying users
  // re-handshake silently before the cache goes stale.
  return { serverPubB64: eph.publicKeyB64, wrapped, release, assetId: req.assetId, exp: now + (opts.ttlMs ?? 2 * 60_000) };
}

/**
 * CLIENT: open a grant to recover the asset key, using the ephemeral PRIVATE key
 * from this session's handshake (never sent anywhere). Re-derives the SAME ECDHE
 * secret and unwraps. Throws if the grant doesn't match (tamper / wrong session).
 */
export async function openUnlock(eph: Ephemeral, grant: UnlockGrant, sub: string, device: string): Promise<Uint8Array> {
  const ctx = `${sub}|${device}|${grant.assetId}|${eph.publicKeyB64}|${grant.serverPubB64}`;
  const w = await wrapKey(eph.privateKey, grant.serverPubB64, ctx);
  return decryptAsset(grant.wrapped, w);
}

export const isDenied = (g: UnlockGrant | UnlockDenied): g is UnlockDenied => (g as UnlockDenied).denied === true;

/**
 * CLIENT one-shot: run the whole handshake and return the recovered asset key.
 * genEphemeral → POST {entitlement, device, assetId, clientPub} → openUnlock. The
 * ephemeral private key is created here and never leaves; throws if the server
 * denies (no entitlement / wrong device / expired) — the caller then can't decrypt
 * the model, which is the point. `sub` is read by the caller from its entitlement.
 */
export async function requestUnlock(
  endpoint: string,
  args: { entitlement: string; sub: string; device: string; assetId: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Uint8Array> {
  const f = args.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const eph = await genEphemeral();
  // Hard ceiling on the handshake — without this, a hung endpoint (server
  // outage, captive portal, ISP intercept) leaves the encrypted asset
  // permanently un-decryptable for the session because no caller can
  // signal failure to the load chain.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await f(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ entitlement: args.entitlement, device: args.device, assetId: args.assetId, clientPubB64: eph.publicKeyB64 }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('unlock timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 403) { const j = await res.json().catch(() => ({})); throw new Error('unlock denied: ' + ((j as { reason?: string }).reason ?? 'forbidden')); }
  if (!res.ok) throw new Error('unlock unavailable (' + res.status + ')');
  const grant = (await res.json()) as UnlockGrant;
  return openUnlock(eph, grant, args.sub, args.device);
}
