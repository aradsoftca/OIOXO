/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo licensing — the CLIENT side (LICENSE.md §3,5). Holds a stable device id,
 * fetches the signed entitlement (+ Pro content key) from /api/entitlement, caches
 * it for the offline grace window, and answers "is this feature unlocked?". The
 * content key is kept in memory only (never persisted) and handed to the protected
 * loader to decrypt the Pro brain.
 *
 * This is NOT the security boundary — a cracker can edit client checks. The real
 * gate is that without a valid session the server returns no content key, so the
 * Pro assets never decrypt (protect.ts). This module just makes the legit path
 * smooth (and degrade gracefully offline).
 */
import { isUsable, type EntitlementClaims, type Tier } from './entitlement';

const DEVICE_KEY = 'oioxo.device';
const ENT_KEY = 'oioxo.entitlement'; // cached token + claims (NOT the content key)

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** A stable per-install device id (persisted; OS keychain on desktop later). */
export function deviceId(): string {
  const s = store();
  let id = s?.getItem(DEVICE_KEY) ?? '';
  if (!id) {
    const b = (globalThis.crypto ?? ({} as any)).getRandomValues?.(new Uint8Array(16)) ?? new Uint8Array(16);
    id = Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('');
    s?.setItem(DEVICE_KEY, id);
  }
  return id;
}

function decodeClaims(token: string): EntitlementClaims | null {
  try {
    const dot = token.indexOf('.');
    const payload = dot > 0 ? token.slice(0, dot) : token;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}

export interface Entitlement {
  tier: Tier;
  claims: EntitlementClaims | null;
  /** Pro content key (base64), in memory only; null for free/offline. */
  contentKey: string | null;
  /** True if served from cache (offline / within TTL). */
  cached: boolean;
}

let _mem: Entitlement | null = null;

/**
 * Fetch + cache the entitlement. Online: calls /api/entitlement and caches the
 * token. Offline / failure: falls back to the cached token while it's still within
 * its grace window (so a brief outage doesn't lock out a paid user). The content
 * key is only ever available right after a successful online fetch — offline you
 * keep running the already-decrypted brain for the session, but a fresh launch
 * needs to come online to re-obtain it.
 */
export async function getEntitlement(opts: { force?: boolean } = {}): Promise<Entitlement> {
  // Re-fetch when the cached entitlement has expired. Without this check the
  // in-memory cache stuck around for the page's lifetime — a long-running tab
  // (multi-day work session) kept showing Pro UI even after the underlying
  // entitlement passed its `exp`, because nothing here triggered a refresh
  // until something else called force=true. The server is the source of
  // truth (Pass 85's heartbeat + Pass 73's API gates), so this is cosmetic
  // only, but mismatched UI is confusing.
  if (_mem && !opts.force) {
    const exp = _mem.claims?.exp;
    if (typeof exp === 'number' && Date.now() < exp) return _mem;
  }
  const device = deviceId();
  try {
    const r = await fetch('/api/entitlement', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const claims = decodeClaims(j.entitlement);
    _mem = { tier: j.tier, claims, contentKey: j.contentKey ?? null, cached: false };
    store()?.setItem(ENT_KEY, j.entitlement); // cache token only, not the key
    return _mem;
  } catch {
    // Offline: use the cached token within its grace window.
    const cachedTok = store()?.getItem(ENT_KEY);
    const claims = cachedTok ? decodeClaims(cachedTok) : null;
    const usable = isUsable(claims, { device });
    _mem = { tier: usable.ok ? (claims!.tier as Tier) : 'free', claims: usable.ok ? claims : null, contentKey: null, cached: true };
    return _mem;
  }
}

/** Is a feature unlocked right now? (online claims, or cached within grace). */
export async function hasFeature(feature: string): Promise<boolean> {
  const e = await getEntitlement();
  return isUsable(e.claims, { device: deviceId(), feature }).ok;
}

export function isPro(e: Entitlement | null = _mem): boolean {
  return !!e && (e.tier === 'pro' || e.tier === 'team');
}

/** Drop the in-memory entitlement (e.g. on sign-out) so the next call re-fetches. */
export function clearEntitlement(): void {
  _mem = null;
}
