import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mintUnlock, isDenied, deriveAssetKey, type UnlockRequest } from '@/lib/oioxo/unlock';
import { keyFromB64 } from '@/lib/oioxo/protect';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decryption key for Xonvert's ENCRYPTED tool engine workers (image / codec /
 * audio / cad / model3d) — the "permission as a key" lock shared with the oioxo AI
 * gate (/api/code-key), applied to the file tools. The worker bundles ship
 * AES-256-GCM encrypted (scripts/encrypt-workers.mjs); without this key the bytes
 * are inert, so a copied site on another domain does nothing.
 *
 * ANTI-CLONE, not a paywall: the base tools are free to try, so this grants the key
 * to ANY valid same-origin session (free AND pro) — it just refuses CROSS-ORIGIN
 * callers (a clone sends a browser-stamped Origin it can't forge → 403) and anyone
 * without a live, device-bound, server-signed entitlement. Per-asset keys derive
 * from one master (TOOL_WASM_KEY) + release, so a leaked single key is scoped and
 * dies on the next deploy. Daily free LIMITS are enforced separately by /api/usage
 * before each gated action — this endpoint protects the code, not the quota.
 *
 * Same ALLOWED_HOSTS as /api/code-key so BOTH brands (xonvert + oioxo) inherit the
 * lock with no extra wiring.
 */


/** DEV ONLY: when TOOL_WASM_KEY isn't provisioned, fall back to the ephemeral key
 *  scripts/encrypt-workers.mjs persisted, so local dev unlocks the same .enc it
 *  built. Never used in production (real key must be set in the environment). */
let _devKey: string | null | undefined;
function devMasterKey(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (_devKey !== undefined) return _devKey;
  try { _devKey = readFileSync(path.join(process.cwd(), '.tool-wasm-key.dev'), 'utf8').trim() || null; }
  catch { _devKey = null; }
  return _devKey;
}

/** Closed: the key is only reachable via the POST ECDHE handshake below. */
export async function GET() {
  return NextResponse.json({ error: 'gone', use: 'POST /api/tool-key (unlock handshake)' }, { status: 410 });
}

export async function POST(req: Request) {
  // Shared rate-limit + UA + origin/referer pre-check (lib/oioxo/gate).
  const pre = preCheckRequest(req);
  if (pre) return pre;

  // Reuse the AI gate's entitlement secret so /api/entitlement tokens verify here.
  const masterB64 = process.env.TOOL_WASM_KEY || devMasterKey();
  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!masterB64 || !secret) {
    return NextResponse.json({ denied: true, reason: 'unconfigured' }, { status: 503 });
  }

  let body: Partial<UnlockRequest>;
  try { body = await req.json(); } catch { return NextResponse.json({ denied: true, reason: 'malformed' }, { status: 400 }); }
  if (!body.entitlement || !body.device || !body.assetId || !body.clientPubB64) {
    return NextResponse.json({ denied: true, reason: 'missing-fields' }, { status: 400 });
  }

  const release = process.env.TOOL_WASM_RELEASE || 'v1';
  // Per-asset key from the master (must match what encrypt-workers.mjs used).
  const assetKey = await deriveAssetKey(keyFromB64(masterB64), body.assetId, release);

  // No feature requirement: base tools are free. The handshake still demands a
  // valid, live, device-bound entitlement — and the origin check above blocks clones.
  const grant = await mintUnlock(
    { entitlement: body.entitlement, device: body.device, assetId: body.assetId, clientPubB64: body.clientPubB64 },
    { secret, assetKey, release },
  );
  if (isDenied(grant)) return NextResponse.json(grant, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
}
