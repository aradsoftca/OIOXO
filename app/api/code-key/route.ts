import { NextResponse } from 'next/server';
import { mintUnlock, isDenied, type UnlockRequest } from '@/lib/oioxo/unlock';
import { keyFromB64 } from '@/lib/oioxo/protect';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decryption key for oioxo's on-device CODE model (the conductor) — the same
 * "permission as a key" gate as /api/brain-key, applied to the model. The model
 * ships AES-encrypted (on any CDN, even HF — it can't read it); without this key
 * the bytes are inert. A copied client on another domain sends a cross-origin
 * Origin the browser stamps and can't forge → rejected. Rotated every deploy, so
 * a leaked key dies on the next ship.
 *
 * Honest ceiling (same as the brain gate): a server-side proxy can relay the key,
 * and the weights decrypt in the browser to run — so a determined paid session
 * can extract them once. This raises cost + gives a rate-limitable, per-account
 * chokepoint; the durable moat is the loop + the retraining flywheel.
 */

/**
 * The legacy GET handed the raw key to any same-origin caller — a soft door. It is
 * now CLOSED: the only way to the key is the POST ECDHE handshake below, which
 * requires a live, device-bound entitlement. (No live callers used GET — the
 * protected model isn't served yet — so closing it is zero-risk.)
 */
export async function GET() {
  return NextResponse.json({ error: 'gone', use: 'POST /api/code-key (unlock handshake)' }, { status: 410 });
}

/**
 * HARD gate (the "rock"): POST the unlock handshake. Unlike the legacy GET (which
 * hands the raw key to any same-origin caller), this returns the content key only
 * WRAPPED under a fresh per-session ECDHE secret, and ONLY after verifying a live,
 * device-bound, server-signed entitlement. No entitlement / wrong device / expired
 * → a 403 denial, never the key. A captured response is useless (bound to the
 * caller's ephemeral key). Body: { entitlement, device, assetId, clientPubB64 }.
 */
export async function POST(req: Request) {
  // Shared rate-limit + UA + origin/referer pre-check (lib/oioxo/gate).
  const pre = preCheckRequest(req);
  if (pre) return pre;
  const keyB64 = process.env.OIOXO_CODE_KEY;
  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!keyB64 || !secret) return NextResponse.json({ denied: true, reason: 'unconfigured' }, { status: 503 });

  let body: Partial<UnlockRequest>;
  try { body = await req.json(); } catch { return NextResponse.json({ denied: true, reason: 'malformed' }, { status: 400 }); }
  if (!body.entitlement || !body.device || !body.assetId || !body.clientPubB64) {
    return NextResponse.json({ denied: true, reason: 'missing-fields' }, { status: 400 });
  }

  const grant = await mintUnlock(
    { entitlement: body.entitlement, device: body.device, assetId: body.assetId, clientPubB64: body.clientPubB64 },
    { secret, assetKey: keyFromB64(keyB64), release: process.env.OIOXO_CODE_RELEASE || 'v1' },
  );
  if (isDenied(grant)) return NextResponse.json(grant, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
}
