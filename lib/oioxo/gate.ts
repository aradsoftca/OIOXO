/**
 * Shared HARD gate for the encrypted-asset unlock endpoints (/api/tool-key,
 * /api/code-key, future siblings). Bundles four checks so every key endpoint
 * gets the same protection:
 *
 *   1. Per-IP rate limit  — best-effort token bucket, blocks key-scraping bursts
 *   2. Browser-shaped UA  — drops curl / scrapy / declared bots
 *   3. Origin / Referer   — must be present AND in the allowlist
 *   4. (delegated) handshake — the route itself runs the ECDHE+entitlement check
 *
 * The first three run BEFORE any crypto, so an attacker can't burn server CPU
 * on the expensive ECDHE+derive without first passing the cheap filters.
 */

import { NextResponse } from 'next/server';
import { take, type Bucket } from '@/lib/rate-limit';

export const ALLOWED_HOSTS = new Set([
  'oioxo.com', 'www.oioxo.com',
  'xonvert.com', 'www.xonvert.com', 'new.xonvert.com',
  'localhost:3000', 'localhost:3001', '127.0.0.1:3001',
]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).host.toLowerCase(); } catch { return null; }
}

/** Per-IP token bucket. Single-process; resets on cold start. Bounded sweep
 *  lives in lib/rate-limit so all six rate-limited endpoints share the same
 *  OOM-safe implementation. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const RATE_BUCKETS = new Map<string, Bucket>();

function rateLimit(ip: string): boolean {
  return take(RATE_BUCKETS, ip, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
}

function clientIp(req: Request): string {
  // Prefer cf-connecting-ip when behind Cloudflare — the rest of the codebase
  // (middleware, /api/usage, /api/support, /api/auth/*) uses this precedence,
  // so the key gates here should match. Without cf-connecting-ip first, every
  // request behind CF would share the same x-forwarded-for chain prefix and
  // the per-IP rate-limit bucket would over-merge.
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

function looksLikeBrowser(ua: string | null): boolean {
  if (!ua) return false;
  const s = ua.toLowerCase();
  if (!s.startsWith('mozilla/')) return false;
  if (/(curl|wget|python|libwww|scrapy|crawler|spider|bot)\b/.test(s)) return false;
  return true;
}

/** Run the four cheap pre-checks. Returns null on pass, or a NextResponse to
 *  short-circuit with on fail. Call this at the top of any key endpoint. */
export function preCheckRequest(req: Request): NextResponse | null {
  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json({ denied: true, reason: 'rate-limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  if (!looksLikeBrowser(req.headers.get('user-agent'))) {
    return NextResponse.json({ denied: true, reason: 'forbidden-client' }, { status: 403 });
  }
  const reqHost = (req.headers.get('host') || '').toLowerCase();
  const originHost = hostOf(req.headers.get('origin'));
  const refererHost = hostOf(req.headers.get('referer'));
  const declaredHost = originHost ?? refererHost;
  if (!declaredHost) {
    return NextResponse.json({ denied: true, reason: 'no-origin' }, { status: 403 });
  }
  if (declaredHost !== reqHost && !ALLOWED_HOSTS.has(declaredHost)) {
    return NextResponse.json({ denied: true, reason: 'forbidden-origin' }, { status: 403 });
  }
  return null;
}
