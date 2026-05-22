/**
 * Composite anonymous identity for usage metering.
 *
 * We derive two independent fingerprints from each request and meter against
 * BOTH, taking the max usage. This makes the gate "magical" — near-zero cost
 * and hard to bypass:
 *   - cookieFp: an httpOnly cookie that survives IP changes (VPN, mobile↔wifi)
 *   - ipFp:     IP + UA hash that survives cookie clearing / incognito
 * Clearing cookies doesn't reset you (IP still counts); switching IP doesn't
 * reset you (cookie still counts).
 */

import crypto from 'crypto';

export const USAGE_COOKIE = 'xu_id';
/** ~1 year — long-lived anchor; the daily reset comes from the date column. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function getClientIp(h: Headers): string {
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf;
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}

export function newCookieId(): string {
  return crypto.randomUUID();
}

export function cookieFingerprint(cookieId: string): string {
  return 'c:' + sha(cookieId);
}

export function ipFingerprint(h: Headers): string {
  return 'i:' + sha(`${getClientIp(h)}|${h.get('user-agent') || ''}`);
}

/** Build the fingerprint set to meter against. Skips an unknown IP. */
export function fingerprints(h: Headers, cookieId: string): string[] {
  const fps = [cookieFingerprint(cookieId)];
  if (getClientIp(h) !== 'unknown') fps.push(ipFingerprint(h));
  return fps;
}
