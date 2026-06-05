import { NextResponse } from 'next/server';
import { mintUnlock, isDenied, deriveAssetKey, type UnlockRequest } from '@/lib/oioxo/unlock';
import { keyFromB64 } from '@/lib/oioxo/protect';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decryption-key handshake for oioxo's on-device MAIN-AI models — the answer
 * engine's reranker (and future encoder heads). Same "permission IS the key"
 * gate as /api/code-key, but:
 *   • the key is DERIVED per-asset from one master (deriveAssetKey) so each model
 *     has its own key and rotates per release — one secret, many assets;
 *   • NO Pro feature is required — the main AI is available to free users too —
 *     but a live, device-bound, server-signed entitlement + the fresh ECDHE
 *     handshake are STILL required, so the model cannot run without us.
 *
 * The weights ship AES-256-GCM encrypted (on any CDN); without the per-session
 * unwrapped key the bytes are inert. A stolen download = ciphertext; a captured
 * grant is bound to one session's ephemeral keys; the key rotates per release.
 */
export async function GET() {
  return NextResponse.json({ error: 'gone', use: 'POST /api/ai-key (unlock handshake)' }, { status: 410 });
}

export async function POST(req: Request) {
  // Shared rate-limit + UA + origin/referer pre-check (lib/oioxo/gate).
  const pre = preCheckRequest(req);
  if (pre) return pre;
  const masterB64 = process.env.OIOXO_AI_SECRET;
  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!masterB64 || !secret) return NextResponse.json({ denied: true, reason: 'unconfigured' }, { status: 503 });

  let body: Partial<UnlockRequest>;
  try { body = await req.json(); } catch { return NextResponse.json({ denied: true, reason: 'malformed' }, { status: 400 }); }
  if (!body.entitlement || !body.device || !body.assetId || !body.clientPubB64) {
    return NextResponse.json({ denied: true, reason: 'missing-fields' }, { status: 400 });
  }
  // Only mint keys for our own AI model assets — never derive a key for an
  // arbitrary asset id a caller invents.
  if (!/^models\/oioxo-[a-z0-9-]+$/.test(body.assetId)) {
    return NextResponse.json({ denied: true, reason: 'unknown-asset' }, { status: 400 });
  }

  const release = process.env.OIOXO_AI_RELEASE || 'v1';
  const assetKey = await deriveAssetKey(keyFromB64(masterB64), body.assetId, release);
  const grant = await mintUnlock(
    { entitlement: body.entitlement, device: body.device, assetId: body.assetId, clientPubB64: body.clientPubB64 },
    { secret, assetKey, release }, // no `feature` → free tier passes, but entitlement is still required
  );
  if (isDenied(grant)) return NextResponse.json(grant, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
}
