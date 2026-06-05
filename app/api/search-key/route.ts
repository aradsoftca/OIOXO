import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mintUnlock, isDenied, deriveAssetKey, type UnlockRequest } from '@/lib/oioxo/unlock';
import { keyFromB64 } from '@/lib/oioxo/protect';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decryption key for the oioxo SEARCH ENGINE — extends the same "permission
 * as a key" lock the tool engines (/api/tool-key) and code AI (/api/code-key)
 * already use, applied to the search engine's encrypted assets:
 *
 *   - The 300+ IA provider implementations (search.html main script body),
 *   - The on-device engine modules (oioxo/engines/*),
 *   - The skill modules wrapping free public APIs (oioxo/skills/*),
 *   - The 390-tool catalog routing map (oioxo/catalog.json).
 *
 * Each ships AES-256-GCM encrypted at oioxo/protected/{assetId}.enc (emitted
 * by scripts/encrypt-search.mjs). Without this key the bytes are inert →
 * a cloned site does nothing.
 *
 * ANTI-CLONE, not a paywall: search is free to use, so this grants the key
 * to ANY valid same-origin session — it just refuses CROSS-ORIGIN callers
 * (a clone sends a browser-stamped Origin it can't forge → 403) and anyone
 * without a live, device-bound, server-signed entitlement. Per-asset keys
 * derive from one master (TOOL_WASM_KEY, shared with the tool gate) +
 * release, so a leaked single key is scoped and dies on the next deploy.
 *
 * Honest ceiling (same as tool/code gate): assets decrypt in the tab to
 * run, so a determined paid session can dump them once. The point is to
 * turn a 10-minute `wget` clone into an ongoing reverse-engineering war,
 * and give us a rate-limitable, per-account chokepoint via the heartbeat.
 */

/** DEV ONLY: ephemeral key fallback so local dev unlocks the .enc the same
 *  encrypt step produced. Never used in production. */
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
  return NextResponse.json({ error: 'gone', use: 'POST /api/search-key (unlock handshake)' }, { status: 410 });
}

export async function POST(req: Request) {
  // Shared rate-limit + UA + origin/referer pre-check (lib/oioxo/gate).
  // The allowlist already includes oioxo.com — search inherits the lock.
  const pre = preCheckRequest(req);
  if (pre) return pre;

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

  // Asset ids must be in the search namespace: "search-providers", "catalog",
  // "engine-{name}", "skill-{name}", "router-{name}". The encryption script
  // emits these names.
  const allowed = /^(search-providers|catalog|engine-[a-z0-9-]{1,32}|skill-[a-z0-9-]{1,32}|router-[a-z0-9-]{1,32})$/;
  if (!allowed.test(body.assetId)) {
    return NextResponse.json({ denied: true, reason: 'unknown-asset' }, { status: 400 });
  }

  const release = process.env.TOOL_WASM_RELEASE || 'v1';
  // Per-asset key from the master (same derivation as scripts/encrypt-search.mjs).
  const assetKey = await deriveAssetKey(keyFromB64(masterB64), body.assetId, release);

  const grant = await mintUnlock(
    { entitlement: body.entitlement, device: body.device, assetId: body.assetId, clientPubB64: body.clientPubB64 },
    { secret, assetKey, release },
  );
  if (isDenied(grant)) return NextResponse.json(grant, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
}
