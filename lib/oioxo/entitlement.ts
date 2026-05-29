/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo licensing (LICENSE.md §5) — the ENTITLEMENT token. The server mints a
 * short-TTL, device-bound, signed entitlement after checking the subscription;
 * the client presents it and caches it for an offline grace window. The signature
 * is the SERVER's boundary (verified on every online call). The client's offline
 * check (`isUsable`) only governs the grace period — it is NOT the security
 * boundary; that is the content key in protect.ts ("the check delivers the asset").
 *
 * Isomorphic (WebCrypto HMAC-SHA256): runs in Node 22 and the browser. Pure +
 * Node-testable: sign → verify → tamper-reject → expiry → device-mismatch.
 */

export type Tier = 'free' | 'pro' | 'lifetime' | 'team';

export interface EntitlementClaims {
  /** Account id (subject). */
  sub: string;
  /** Bound device id — the entitlement is only usable on this device. */
  device: string;
  tier: Tier;
  /** Unlocked feature flags (e.g. 'pro-coder', 'search', 'sync'). */
  features: string[];
  /** Issued-at + expiry, epoch ms. */
  iat: number;
  exp: number;
  /** Random per-issue, so two tokens for the same claims still differ. */
  nonce: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Coerce a Uint8Array to BufferSource for WebCrypto. Newer TS libs type byte
 *  arrays as Uint8Array<ArrayBufferLike>, which the crypto.subtle overloads
 *  reject (SharedArrayBuffer variance) even though it's always a plain buffer. */
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64urlFromBytes(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Mint a signed entitlement token: `<payloadB64url>.<sigB64url>`. Server-only
 *  (needs the secret). `ttlMs` defaults to 72h. */
export async function signEntitlement(
  claims: Omit<EntitlementClaims, 'iat' | 'exp' | 'nonce'>,
  secret: string,
  opts: { ttlMs?: number; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const full: EntitlementClaims = {
    ...claims,
    iat: now,
    exp: now + (opts.ttlMs ?? 72 * 3600_000),
    nonce: b64urlFromBytes(crypto.getRandomValues(new Uint8Array(9))),
  };
  const payload = b64urlFromBytes(enc.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

export interface VerifyResult {
  ok: boolean;
  claims?: EntitlementClaims;
  reason?: 'malformed' | 'bad-signature' | 'expired' | 'not-yet-valid' | 'device-mismatch';
}

/**
 * Verify a token's signature + time window (server-side, needs the secret). Use
 * `expectDevice` to reject a token replayed from another machine. WebCrypto's
 * verify is constant-time. `skewMs` tolerates small clock drift.
 */
export async function verifyEntitlement(
  token: string,
  secret: string,
  opts: { now?: number; expectDevice?: string; skewMs?: number } = {},
): Promise<VerifyResult> {
  const now = opts.now ?? Date.now();
  const skew = opts.skewMs ?? 60_000;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let sig: Uint8Array;
  try { sig = bytesFromB64url(sigB64); } catch { return { ok: false, reason: 'malformed' }; }
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), bs(sig), bs(enc.encode(payload))).catch(() => false);
  if (!valid) return { ok: false, reason: 'bad-signature' };

  let claims: EntitlementClaims;
  try { claims = JSON.parse(dec.decode(bytesFromB64url(payload))); } catch { return { ok: false, reason: 'malformed' }; }
  if (typeof claims?.exp !== 'number' || typeof claims?.iat !== 'number') return { ok: false, reason: 'malformed' };
  if (now + skew < claims.iat) return { ok: false, claims, reason: 'not-yet-valid' };
  if (now - skew > claims.exp) return { ok: false, claims, reason: 'expired' };
  if (opts.expectDevice && claims.device !== opts.expectDevice) return { ok: false, claims, reason: 'device-mismatch' };
  return { ok: true, claims };
}

/**
 * The CLIENT's offline check: may we keep operating on a cached entitlement?
 * Valid while within `exp`, then for an extra `graceMs` (default 24h) so a brief
 * outage doesn't lock the user out — after that, force revalidation. Does NOT
 * verify the signature (no secret on the client); it only gates the grace window.
 * Real enforcement is that the content key (protect.ts) rotates and won't decrypt
 * updated assets without coming back online.
 */
export function isUsable(
  claims: EntitlementClaims | null | undefined,
  opts: { now?: number; graceMs?: number; device?: string; feature?: string } = {},
): { ok: boolean; reason?: 'none' | 'expired-past-grace' | 'device-mismatch' | 'missing-feature' } {
  if (!claims) return { ok: false, reason: 'none' };
  const now = opts.now ?? Date.now();
  const grace = opts.graceMs ?? 24 * 3600_000;
  if (opts.device && claims.device !== opts.device) return { ok: false, reason: 'device-mismatch' };
  if (now > claims.exp + grace) return { ok: false, reason: 'expired-past-grace' };
  if (opts.feature && !(claims.features ?? []).includes(opts.feature)) return { ok: false, reason: 'missing-feature' };
  return { ok: true };
}

/** A fresh random device id (persist in OS keychain on desktop / localStorage on
 *  web). Binding the entitlement to it stops one unlocked token being shared. */
export function newDeviceId(): string {
  return b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

/** Read claims WITHOUT verifying (client-side convenience — the client has no
 *  secret). Use only to read `sub`/`device` for the unlock handshake; never trust
 *  it for security (the server re-verifies the signature on every call). */
export function decodeClaims(token: string): EntitlementClaims | null {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  try { return JSON.parse(dec.decode(bytesFromB64url(token.slice(0, dot)))) as EntitlementClaims; } catch { return null; }
}
