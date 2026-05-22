/**
 * Proof-of-Work gate (server side).
 *
 * Cheap, stateless abuse defense for the few endpoints that actually cost us
 * (outbound network lookups, page fetches, bandwidth). The client must solve a
 * small hash puzzle before it gets a short-lived token; we then accept the
 * token on later calls. Cost is shifted onto the caller — imperceptible for a
 * real user (solved once, ~tens of ms), expensive for a script hammering us.
 *
 * No database, no session store: challenges and tokens are HMAC-signed, so we
 * verify them by recomputing the signature. Verification is microseconds.
 *
 * The token's HMAC is also re-checked in middleware (Web Crypto) using the same
 * secret + format, so the two must stay in sync — see TOKEN_PREFIX / token shape.
 */

import crypto from 'node:crypto';

const SECRET = process.env.POW_SECRET || 'dev-insecure-pow-secret-change-me';
if (!process.env.POW_SECRET && process.env.NODE_ENV === 'production') {
  // Loud, but don't crash — the gate still works, just with a known secret.
  console.warn('[pow] POW_SECRET is not set — using an insecure default. Set it in production.');
}

export const CHALLENGE_TTL_MS = 2 * 60_000;
export const TOKEN_TTL_MS = 30 * 60_000;
const BASE_DIFFICULTY = 14; // ~tens of ms to solve in a browser
const MAX_DIFFICULTY = 24;
export const TOKEN_PREFIX = 'powtok:';

function hmacHex(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}
function sha256(data: string): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}
function leadingZeroBits(buf: Uint8Array): number {
  let bits = 0;
  for (const b of buf) {
    if (b === 0) { bits += 8; continue; }
    bits += Math.clz32(b) - 24;
    break;
  }
  return bits;
}
function timingSafeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

// Adaptive difficulty: track how many challenges an IP asks for per minute and
// ramp the cost so a real user stays near-instant while a flood gets harder.
const issued = new Map<string, { count: number; reset: number }>();
function difficultyFor(ip: string): number {
  const now = Date.now();
  if (issued.size > 10_000) for (const [k, v] of issued) if (now > v.reset) issued.delete(k);
  const e = issued.get(ip);
  if (!e || now > e.reset) { issued.set(ip, { count: 1, reset: now + 60_000 }); return BASE_DIFFICULTY; }
  e.count++;
  // +2 bits (4x cost) for every 10 challenges/min from the same IP.
  return Math.min(MAX_DIFFICULTY, BASE_DIFFICULTY + Math.floor(e.count / 10) * 2);
}

export interface Challenge { salt: string; ts: number; difficulty: number; sig: string }

export function makeChallenge(ip: string): Challenge {
  const salt = crypto.randomBytes(12).toString('hex');
  const ts = Date.now();
  const difficulty = difficultyFor(ip);
  return { salt, ts, difficulty, sig: hmacHex(`${salt}:${ts}:${difficulty}`) };
}

export interface Solution { salt: string; ts: number; difficulty: number; sig: string; nonce: string }

export function verifySolution(s: Solution): boolean {
  if (typeof s.salt !== 'string' || typeof s.nonce !== 'string' || typeof s.sig !== 'string') return false;
  if (!Number.isFinite(s.ts) || !Number.isFinite(s.difficulty)) return false;
  const now = Date.now();
  if (now - s.ts > CHALLENGE_TTL_MS || s.ts > now + 5_000) return false; // stale / future
  if (s.difficulty < BASE_DIFFICULTY || s.difficulty > MAX_DIFFICULTY) return false;
  if (!timingSafeEqHex(hmacHex(`${s.salt}:${s.ts}:${s.difficulty}`), s.sig)) return false; // our challenge?
  return leadingZeroBits(sha256(`${s.salt}:${s.ts}:${s.difficulty}:${s.nonce}`)) >= s.difficulty;
}

/**
 * A coarse client fingerprint (IP + User-Agent). The token is bound to it, so a
 * token lifted from our site can't be replayed from a different client. If it
 * legitimately changes (e.g. a mobile IP rotates), the token simply stops
 * verifying and powFetch transparently solves a fresh one — self-healing.
 */
export function fingerprint(ip: string, ua: string): string {
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
}

export function issueToken(fp: string): { token: string; exp: number } {
  const exp = Date.now() + TOKEN_TTL_MS;
  return { token: `${exp}.${hmacHex(`${TOKEN_PREFIX}${exp}:${fp}`)}`, exp };
}

export function verifyToken(token: string | null | undefined, fp: string): boolean {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = Number(token.slice(0, i));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return timingSafeEqHex(hmacHex(`${TOKEN_PREFIX}${exp}:${fp}`), token.slice(i + 1));
}
