/**
 * PER-ACTION PERMISSION TICKET — the AI/coding stack's signed-entitlement pattern
 * applied at the granularity of a SINGLE tool action.
 *
 * Pattern (mirrors lib/oioxo/entitlement.ts):
 *   • Server mints an HMAC-SHA256-signed `<payloadB64.sigB64>` ticket after
 *     running the policy levers + origin/UA/rate gate + device check.
 *   • The ticket names the toolKey, the input fingerprint, an issued-at, a
 *     short expiry (30s default), a random nonce, and the device id.
 *   • Engines REFUSE TO RUN without a valid ticket — verified server-side
 *     via POST /api/permission-verify before any heavy work. A clone that
 *     strips the UI's enforcePolicy call still can't drive the engine.
 *
 * "Permission IS the asset": there is no boolean to patch. The engine asks
 * the server "is this ticket good?" and only proceeds on yes. A clone on
 * attacker.tld can't get a yes because the origin gate refuses cross-origin
 * permission requests. A captured ticket is dead in 30s and bound to one
 * device.
 *
 * Tickets are nonce-tagged + the nonce is logged server-side on verify, so a
 * ticket can be SPENT ONCE — even within its TTL.
 */

import { hashInputFingerprint } from './fingerprint';
export { hashInputFingerprint };

const enc = new TextEncoder();
const dec = new TextDecoder();

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
  return crypto.subtle.importKey('raw', bs(enc.encode(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export interface TicketClaims {
  /** Tool id this ticket authorises — engine MUST match. */
  toolKey: string;
  /** Short hash of the input (file bytes / args) — binds the ticket to ONE input,
   *  so a captured ticket can only be replayed on the exact same job. */
  input: string;
  /** Device id this ticket was issued for. */
  device: string;
  /** Issued-at + expiry, epoch ms. */
  iat: number;
  exp: number;
  /** Random per-issue → spend-once. */
  nonce: string;
}

/** Mint a signed permission ticket. Server-only (needs the secret). */
export async function signTicket(
  claims: Omit<TicketClaims, 'iat' | 'exp' | 'nonce'>,
  secret: string,
  opts: { ttlMs?: number; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const full: TicketClaims = {
    ...claims,
    iat: now,
    exp: now + (opts.ttlMs ?? 30_000),
    nonce: b64urlFromBytes(crypto.getRandomValues(new Uint8Array(12))),
  };
  const payload = b64urlFromBytes(enc.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), bs(enc.encode(payload)));
  return `${payload}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

export interface TicketVerifyResult {
  ok: boolean;
  claims?: TicketClaims;
  reason?: 'malformed' | 'bad-signature' | 'expired' | 'tool-mismatch' | 'input-mismatch' | 'device-mismatch';
}

/**
 * Verify a ticket. Server-side (needs the secret). Use `expect*` to bind the
 * verification to the in-flight job — a captured ticket for tool A can't be
 * presented to tool B, and a ticket for input X can't be spent on input Y.
 */
export async function verifyTicket(
  token: string,
  secret: string,
  opts: { now?: number; expectToolKey?: string; expectInput?: string; expectDevice?: string; skewMs?: number } = {},
): Promise<TicketVerifyResult> {
  const now = opts.now ?? Date.now();
  const skew = opts.skewMs ?? 5_000;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let sig: Uint8Array;
  try { sig = bytesFromB64url(sigB64); } catch { return { ok: false, reason: 'malformed' }; }
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), bs(sig), bs(enc.encode(payload))).catch(() => false);
  if (!valid) return { ok: false, reason: 'bad-signature' };

  let claims: TicketClaims;
  try { claims = JSON.parse(dec.decode(bytesFromB64url(payload))); } catch { return { ok: false, reason: 'malformed' }; }
  if (typeof claims?.exp !== 'number' || typeof claims?.iat !== 'number') return { ok: false, reason: 'malformed' };
  if (now - skew > claims.exp) return { ok: false, claims, reason: 'expired' };
  if (opts.expectToolKey && claims.toolKey !== opts.expectToolKey) return { ok: false, claims, reason: 'tool-mismatch' };
  if (opts.expectInput && claims.input !== opts.expectInput) return { ok: false, claims, reason: 'input-mismatch' };
  if (opts.expectDevice && claims.device !== opts.expectDevice) return { ok: false, claims, reason: 'device-mismatch' };
  return { ok: true, claims };
}
