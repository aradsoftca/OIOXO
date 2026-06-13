/**
 * APP bearer token — for the native Xtudio apps (Capacitor), which have no
 * NextAuth cookie session. After validating email+password (same bcrypt path as
 * the web Credentials provider), the server mints one of these and the app
 * stores it in the OS keystore. It's then presented as `Authorization: Bearer`
 * to /api/entitlement (and any other app endpoint), which resolves it back to a
 * userId WITHOUT a cookie.
 *
 * Same isomorphic HMAC-SHA256 primitive as entitlement.ts. Signed with a server
 * secret (APP_TOKEN_SECRET, falling back to NEXTAUTH_SECRET so it works on every
 * existing deploy without new config). Long-ish TTL (30d) because the actual Pro
 * gate is the short-TTL entitlement this token is used to FETCH — losing/leaking
 * this token only lets you ask "am I still Pro?", and the answer is re-derived
 * from the live subscription each time.
 */

export interface AppTokenClaims {
  sub: string; // userId
  email?: string;
  iat: number;
  exp: number;
  nonce: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** The secret used to sign app tokens. Dedicated var, else NextAuth's secret. */
export function appTokenSecret(): string | null {
  return process.env.APP_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export async function signAppToken(
  sub: string,
  email: string | undefined,
  secret: string,
  opts: { ttlMs?: number; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const claims: AppTokenClaims = {
    sub,
    email,
    iat: now,
    exp: now + (opts.ttlMs ?? 30 * 24 * 3600_000),
    nonce: b64url(crypto.getRandomValues(new Uint8Array(9))),
  };
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyAppToken(
  token: string,
  secret: string,
  opts: { now?: number; skewMs?: number } = {},
): Promise<{ ok: boolean; claims?: AppTokenClaims }> {
  const now = opts.now ?? Date.now();
  const skew = opts.skewMs ?? 60_000;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return { ok: false };
  const payload = token.slice(0, dot);
  let sig: Uint8Array;
  try { sig = fromB64url(token.slice(dot + 1)); } catch { return { ok: false }; }
  const valid = await crypto.subtle.verify('HMAC', await key(secret), bs(sig), bs(enc.encode(payload))).catch(() => false);
  if (!valid) return { ok: false };
  let claims: AppTokenClaims;
  try { claims = JSON.parse(dec.decode(fromB64url(payload))); } catch { return { ok: false }; }
  if (typeof claims?.exp !== 'number') return { ok: false };
  if (now + skew < claims.iat || now - skew > claims.exp) return { ok: false };
  return { ok: true, claims };
}

/** Pull a userId from a request's `Authorization: Bearer <app-token>` header, or
 *  null if absent/invalid. Lets app endpoints accept the bearer the same way the
 *  web ones accept the NextAuth cookie. */
export async function userIdFromBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) return null;
  const secret = appTokenSecret();
  if (!secret) return null;
  const { ok, claims } = await verifyAppToken(m[1], secret);
  return ok && claims ? claims.sub : null;
}
