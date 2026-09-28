/**
 * Rewarded-ad unlock for the mobile apps (AdMob). Files never touch the server;
 * this only moves the daily COUNT: each verified ad gives AD_REWARD_USES more
 * uses of one category, repeatable, no daily cap (owner decision 2026-09-28).
 *
 * Flow: the page (inside the app) POSTs /api/usage/ad-ticket → gets a signed,
 * short-lived ticket naming this visitor's fingerprints + category → the app
 * shows the AdMob ad with the ticket as SSV custom_data → Google calls
 * GET /api/usage/ad-reward (signed by Google) → we verify both signatures and
 * grant. The callback comes from Google's servers, so the visitor's identity
 * must travel inside the ticket; the HMAC stops anyone minting their own.
 */
import crypto from 'crypto';
export { AD_REWARD_USES } from './config';
const TICKET_TTL_MS = 60 * 60 * 1000;

function secret(): string {
  const v = process.env.AD_TICKET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!v) throw new Error('AD_TICKET_SECRET or NEXTAUTH_SECRET must be set');
  return v;
}

const b64u = (b: Buffer) => b.toString('base64url');
const hmac = (s: string) => b64u(crypto.createHmac('sha256', secret()).update(s).digest());

export interface AdTicket { fps: string[]; category: string; exp: number }

export function signTicket(fps: string[], category: string, now = Date.now()): string {
  const body = b64u(Buffer.from(JSON.stringify({ fps, category, exp: now + TICKET_TTL_MS } satisfies AdTicket)));
  return `${body}.${hmac(body)}`;
}

export function verifyTicket(ticket: string, now = Date.now()): AdTicket | null {
  const [body, mac] = ticket.split('.');
  if (!body || !mac) return null;
  const want = hmac(body);
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as AdTicket;
    if (!Array.isArray(t.fps) || !t.fps.length || typeof t.category !== 'string' || !(t.exp > now)) return null;
    return t;
  } catch {
    return null;
  }
}

// ---- AdMob server-side verification (SSV) ----------------------------------
// https://developers.google.com/admob/android/ssv — the signed message is the
// query string up to (not including) "&signature=", signed ECDSA/SHA-256 with a
// key from the verifier-keys list.
const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let keyCache: { at: number; keys: Map<string, string> } | null = null;

async function verifierKeys(): Promise<Map<string, string>> {
  if (keyCache && Date.now() - keyCache.at < 24 * 60 * 60 * 1000) return keyCache.keys;
  const res = await fetch(KEYS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`verifier keys: HTTP ${res.status}`);
  const j = (await res.json()) as { keys: { keyId: number | string; pem: string }[] };
  const keys = new Map(j.keys.map((k) => [String(k.keyId), k.pem]));
  keyCache = { at: Date.now(), keys };
  return keys;
}

/** Verify an AdMob SSV callback's raw query string. Returns its params when genuine. */
export async function verifyAdMobCallback(rawQuery: string): Promise<URLSearchParams | null> {
  const q = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  const cut = q.indexOf('&signature=');
  if (cut < 0) return null;
  const params = new URLSearchParams(q);
  const sig = params.get('signature');
  const keyId = params.get('key_id');
  if (!sig || !keyId) return null;
  let pem = (await verifierKeys()).get(keyId);
  if (!pem) { keyCache = null; pem = (await verifierKeys()).get(keyId); }
  if (!pem) return null;
  const ok = crypto.verify('sha256', Buffer.from(q.slice(0, cut)), pem, Buffer.from(sig, 'base64url'));
  return ok ? params : null;
}
