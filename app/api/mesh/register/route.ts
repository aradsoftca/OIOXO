/**
 * oioxo Compute Mesh — DEVICE KEY REGISTRATION (stage 7 backend). A logged-in user
 * registers each of their devices' ECDSA public keys here, so the receipts those
 * devices sign (when lending compute) can be verified when credit is claimed.
 *
 *   POST { deviceId, publicKeyJwk, label? }  → register/refresh this device's key
 *   GET                                      → list this account's registered devices
 *
 * Accounts-only (the earning decision). Self-authenticating: the key must fingerprint
 * to the claimed deviceId, and a deviceId already owned by another account is refused
 * (you can't re-point someone else's device id — and even if you did, you can't sign
 * for it without their private key).
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deviceIdForJwk } from '@/lib/oioxo/device-key';

export const runtime = 'nodejs';

async function accountId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await accountId();
  if (!userId) return NextResponse.json({ error: 'sign in to pair devices' }, { status: 401 });

  let body: { deviceId?: string; publicKeyJwk?: JsonWebKey; label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const { deviceId, publicKeyJwk, label } = body;
  if (!deviceId || !publicKeyJwk) return NextResponse.json({ error: 'deviceId + publicKeyJwk required' }, { status: 400 });
  // Sanity-cap user inputs so a hostile caller can't inflate the DB row
  // with a multi-megabyte "JWK". A real P-256 / Ed25519 JWK is <500 bytes;
  // 4KB is generous and rejects anything pathological before we even hash.
  if (typeof deviceId !== 'string' || deviceId.length > 256) return NextResponse.json({ error: 'invalid deviceId' }, { status: 400 });
  if (JSON.stringify(publicKeyJwk).length > 4096) return NextResponse.json({ error: 'jwk too large' }, { status: 400 });

  // The deviceId must be the fingerprint of the submitted key (self-authenticating).
  let derived: string;
  try { derived = await deviceIdForJwk(publicKeyJwk); } catch { return NextResponse.json({ error: 'invalid key' }, { status: 400 }); }
  if (derived !== deviceId) return NextResponse.json({ error: 'deviceId does not match key' }, { status: 400 });

  // Don't let one account claim a deviceId already registered to another.
  const existing = await prisma.deviceKey.findUnique({ where: { deviceId }, select: { userId: true } });
  if (existing && existing.userId !== userId) return NextResponse.json({ error: 'device already registered' }, { status: 409 });

  // Per-user device cap. Without this, a malicious signed-in user can generate
  // arbitrary keypairs locally and call register in a loop — each unique key
  // hashes to a unique deviceId so the upsert path stamps a new row every time,
  // growing the DeviceKey table without bound. 50 is generous for a real user
  // (phone + laptop + a few household devices); blocks the abuse cleanly.
  if (!existing) {
    const owned = await prisma.deviceKey.count({ where: { userId } });
    if (owned >= 50) {
      return NextResponse.json({ error: 'Too many devices on this account — remove unused ones first.' }, { status: 409 });
    }
  }

  await prisma.deviceKey.upsert({
    where: { deviceId },
    create: { deviceId, userId, publicKeyJwk: publicKeyJwk as object, label: label?.slice(0, 64) ?? null },
    update: { lastSeenAt: new Date(), label: label?.slice(0, 64) ?? null },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await accountId();
  if (!userId) return NextResponse.json({ keys: [] });
  const keys = await prisma.deviceKey.findMany({
    where: { userId },
    select: { deviceId: true, label: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  return NextResponse.json({ keys });
}
