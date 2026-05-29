import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Zero-knowledge note store. We only ever see CIPHERTEXT — the decryption key
// lives in the URL fragment (#…) on the client and is never sent here. Notes
// live in memory with a TTL and optional burn-after-reading; nothing persists.

interface Note { ct: string; iv: string; oneTime: boolean; expires: number; burnAt?: number; burnToken?: string }
const notes = new Map<string, Note>();
const MAX_CT = 200 * 1024;        // ~150 KB plaintext
const MAX_NOTES = 20000;
const MAX_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const BURN_GRACE_MS = 30_000; // give the client 30s to confirm decrypt before auto-burning

function sweep() {
  const now = Date.now();
  for (const [id, n] of notes) {
    if (now > n.expires) { notes.delete(id); continue; }
    // Two-phase burn: a GET on a one-time note stages a burn (burnAt). If
    // the client never confirms (e.g., fragment-stripped link), auto-burn
    // after the grace window so the note isn't readable forever.
    if (n.burnAt && now > n.burnAt) notes.delete(id);
  }
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 40)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  let body: { ct?: string; iv?: string; oneTime?: boolean; ttlMs?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  // Cap both fields — iv was unbounded, so a hostile client could push a
  // multi-MB iv past the ct cap and bloat memory per stored note.
  if (typeof body.ct !== 'string' || typeof body.iv !== 'string' ||
      !body.ct || body.ct.length > MAX_CT ||
      !body.iv || body.iv.length > 64) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (notes.size >= MAX_NOTES) {
    sweep();
    // After sweep, if still at the cap, REFUSE rather than grow unbounded.
    // The previous code used `>` and unconditionally added afterwards, so
    // MAX_NOTES was only a sweep trigger.
    if (notes.size >= MAX_NOTES) {
      return NextResponse.json({ error: 'Storage full — try again shortly.' }, { status: 503 });
    }
  }
  const id = crypto.randomBytes(9).toString('base64url');
  const ttl = Math.min(MAX_TTL, Math.max(60_000, Number(body.ttlMs) || MAX_TTL));
  notes.set(id, { ct: body.ct, iv: body.iv, oneTime: !!body.oneTime, expires: Date.now() + ttl });
  return NextResponse.json({ id }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(req: Request) {
  // Rate-limit GET as well. Without this, an attacker can spray random IDs
  // hunting for valid notes (9-byte / 72-bit space is far too big to exhaust,
  // but unlimited GET also lets a network-position attacker race legitimate
  // readers on a known-link to burn the note from under them). 60/5min/IP
  // is generous for legitimate clients (one GET per opened link).
  if (rateLimited(clientIp(req.headers), 60)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429, headers: { 'cache-control': 'no-store' } });
  }
  sweep();
  const id = new URL(req.url).searchParams.get('id') || '';
  const n = notes.get(id);
  if (!n) return NextResponse.json({ error: 'gone' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  let burnToken: string | undefined;
  if (n.oneTime) {
    // Stage the burn but don't delete yet — the client must POST the
    // burnToken back after a successful decrypt. If the link's key fragment
    // was stripped (Slack/Outlook do this), the user gets one shot to retry
    // with a fixed link before sweep() auto-burns at burnAt.
    //
    // CRITICAL: only stage the burn on the FIRST GET. A second concurrent
    // reader (attacker racing the legitimate one) used to get a fresh token
    // and a fresh grace window, defeating burn-after-reading entirely. Now
    // the FIRST request locks the burn timer; subsequent requests in the
    // grace window are refused as 'gone' — the legitimate client already
    // got the only valid burnToken.
    if (n.burnToken) {
      return NextResponse.json({ error: 'gone' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    burnToken = crypto.randomBytes(16).toString('base64url');
    n.burnAt = Date.now() + BURN_GRACE_MS;
    n.burnToken = burnToken;
  }
  return NextResponse.json({ ct: n.ct, iv: n.iv, oneTime: n.oneTime, burnToken }, { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE(req: Request) {
  if (rateLimited(clientIp(req.headers), 40)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const token = url.searchParams.get('token') || '';
  const n = notes.get(id);
  // Constant-time burn-token compare. Plain `===` short-circuits on the first
  // mismatching character, leaking the token byte-by-byte to a timing attacker
  // who can measure RTT precisely. crypto.timingSafeEqual requires equal-length
  // buffers — guard the length first (also short-circuiting, but length is
  // public).
  let ok = false;
  if (n && n.burnToken && n.burnToken.length === token.length && token.length > 0) {
    try {
      ok = crypto.timingSafeEqual(Buffer.from(n.burnToken), Buffer.from(token));
    } catch { /* malformed token */ }
  }
  if (ok) notes.delete(id);
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
