import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPolicy, type LeverType } from '@/lib/limits/policy';
import { signTicket } from '@/lib/oioxo/ticket';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mint a per-action permission ticket — the AI/coding stack's signed-token
 * pattern applied at single-action granularity. Issued ONLY after:
 *   1. Origin + UA + per-IP rate-limit pre-check  (lib/oioxo/gate)
 *   2. Every requested lever passes the server-side policy check
 *
 * The returned ticket binds the action to (toolKey, inputHash, device, 30s
 * TTL, nonce). Engine code (lib/limits/permission-verify) refuses to run
 * without a valid ticket — and verification re-binds against the SAME
 * tool/input/device, so a captured ticket is dead in 30s AND useless on any
 * other input. The nonce is spent-once via the categoryUsage table — replay
 * attempts within the TTL also fail.
 *
 * Body: { toolKey, inputHash, device, specs: GateSpec[] }
 * 200  : { ticket, exp } — engine may proceed
 * 403  : { allowed: false, reason } — a lever failed (UI shows the paywall)
 * 4xx  : pre-check / malformed
 */

type Spec =
  | { type: 'lever'; lever: LeverType; value: number }
  | { type: 'format'; format: string };

interface Body {
  toolKey?: string;
  inputHash?: string;
  device?: string;
  specs?: Spec[];
}

async function isPro(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return false;
  const user = await prisma.user.findUnique({ where: { id }, select: { plan: true, subscriptionEndsAt: true } });
  // Fail-safe: if Stripe's subscription.deleted webhook never lands, the
  // stored plan stays PRO forever. Past-period users gate as FREE here.
  if (user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now()) return false;
  return user?.plan === 'PRO' || user?.plan === 'BUSINESS';
}

export async function POST(req: Request) {
  const pre = preCheckRequest(req);
  if (pre) return pre;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ allowed: false, reason: 'bad-request' }, { status: 400 });
  }
  const toolKey = body.toolKey;
  const inputHash = body.inputHash ?? '';
  const device = body.device ?? '';
  const specs = body.specs ?? [];
  if (!toolKey) return NextResponse.json({ allowed: false, reason: 'tool-key-required' }, { status: 400 });

  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!secret) {
    // Unconfigured = service degraded. Free users get the hard fail (no ticket);
    // Pro users pass via the cached entitlement path. Mirrors the AI gate.
    if (await isPro()) {
      return NextResponse.json({ ticket: null, allowed: true, pro: true });
    }
    return NextResponse.json({ allowed: false, reason: 'unconfigured' }, { status: 503 });
  }

  // Pro fail-open: no levers applied, always allowed.
  const pro = await isPro();
  if (!pro) {
    const policy = getPolicy(toolKey);
    if (policy) {
      for (const s of specs) {
        if (s.type === 'lever') {
          const lever = policy.levers.find((l) => l.type === s.lever);
          if (lever && s.value > lever.free) {
            return NextResponse.json({ allowed: false, reason: 'lever-exceeded', lever: s.lever, free: lever.free, observed: s.value });
          }
        } else {
          const lever = policy.levers.find((l) => l.type === 'formats');
          if (lever?.freeFormats && !lever.freeFormats.includes(s.format.toLowerCase())) {
            return NextResponse.json({ allowed: false, reason: 'format-pro-only', format: s.format, free: lever.freeFormats });
          }
        }
      }
    }
  }

  const ticket = await signTicket(
    { toolKey, input: inputHash, device },
    secret,
    { ttlMs: 30_000 },
  );
  return NextResponse.json({
    allowed: true,
    pro,
    ticket,
    exp: Date.now() + 30_000,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
