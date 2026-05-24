import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signEntitlement, type Tier } from '@/lib/oioxo/entitlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issues a signed, device-bound, short-TTL ENTITLEMENT (+ the Pro content key for
 * paying tiers) — LICENSE.md §3,5. This is the "check that delivers the asset":
 * the Pro brain ships encrypted and only decrypts with the content key returned
 * here, so removing the check yields no key and no Pro brain (no fallback).
 *
 * Gated by login + plan (reuses next-auth + prisma like /api/usage) and by ORIGIN
 * (like /api/brain-key) so a cross-site copy can't fetch it. The content key
 * rotates per release (env, same pattern as BRAIN_WASM_KEY) → a leaked key dies on
 * the next deploy. Per-user keying (protect.ts) is ready for when Pro assets are
 * served per-user; v1 returns the per-release master key + logs issuance.
 */

const ALLOWED_HOSTS = new Set([
  'oioxo.com', 'www.oioxo.com', 'xonvert.com', 'www.xonvert.com', 'new.xonvert.com',
  'localhost:3000', 'localhost:3001', 'localhost:3002', 'localhost:3210', '127.0.0.1:3001',
]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).host.toLowerCase(); } catch { return null; }
}

const PRO_FEATURES = ['pro-coder', 'big-models', 'frontier-byok', 'search', 'sync', 'tools', 'ai'];

/** Map the account plan to an entitlement tier + unlocked features. */
function entitlementFor(plan: string | null | undefined): { tier: Tier; features: string[] } {
  if (plan === 'BUSINESS') return { tier: 'team', features: [...PRO_FEATURES, 'teams'] };
  if (plan === 'PRO') return { tier: 'pro', features: PRO_FEATURES };
  return { tier: 'free', features: [] };
}

export async function POST(req: Request) {
  // Origin gate (same reasoning as /api/brain-key): reject a present cross-site Origin.
  const reqHost = (req.headers.get('host') || '').toLowerCase();
  const originHost = hostOf(req.headers.get('origin'));
  if (originHost && originHost !== reqHost && !ALLOWED_HOSTS.has(originHost)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { device?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const device = (body.device || '').trim();
  if (!device || device.length > 256) return NextResponse.json({ error: 'device required' }, { status: 400 });

  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'unconfigured' }, { status: 503 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    // No login → a free, device-bound entitlement (no content key; free brain is open).
    const entitlement = await signEntitlement({ sub: 'anon', device, tier: 'free', features: [] }, secret);
    return NextResponse.json({ tier: 'free', entitlement, contentKey: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const { tier, features } = entitlementFor(user?.plan);
  const entitlement = await signEntitlement({ sub: userId, device, tier, features }, secret);

  // Paying tiers get the per-release Pro content key (decrypts the protected brain).
  let contentKey: string | null = null;
  if (tier !== 'free') {
    contentKey = process.env.OIOXO_PRO_KEY ?? null;
    // Attribute issuance so abnormal patterns (one account, many devices) are visible.
    console.log(`[entitlement] issued tier=${tier} user=${userId} device=${device.slice(0, 12)}…`);
  }

  return NextResponse.json({ tier, entitlement, contentKey }, { headers: { 'Cache-Control': 'no-store' } });
}
