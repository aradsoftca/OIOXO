import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

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
const ALLOWED_HOSTS = new Set([
  'oioxo.com', 'www.oioxo.com',
  'xonvert.com', 'www.xonvert.com', 'new.xonvert.com',
  'localhost:3000', 'localhost:3001', '127.0.0.1:3001',
]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).host.toLowerCase(); } catch { return null; }
}

export async function GET(req: Request) {
  const reqHost = (req.headers.get('host') || '').toLowerCase();
  const originHost = hostOf(req.headers.get('origin'));
  // Reject only a PRESENT cross-site Origin (same-origin GETs omit it).
  if (originHost && originHost !== reqHost && !ALLOWED_HOSTS.has(originHost)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const key = process.env.OIOXO_CODE_KEY;
  if (!key) return NextResponse.json({ error: 'unconfigured' }, { status: 503 });

  // Tier so the client knows whether to meter runs (Pro = unlimited). The KEY is
  // the anti-copy gate (all valid sessions get it); run-count metering is separate
  // (/api/usage). PRO/BUSINESS bypass the run meter.
  let pro = false;
  try {
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string } | undefined)?.id;
    if (id) {
      const u = await prisma.user.findUnique({ where: { id }, select: { plan: true } });
      pro = u?.plan === 'PRO' || u?.plan === 'BUSINESS';
    }
  } catch { /* anon → free */ }

  return NextResponse.json({ key, pro }, { headers: { 'Cache-Control': 'no-store' } });
}
