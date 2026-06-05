import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPolicy, type LeverType } from '@/lib/limits/policy';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-attested policy check — defense-in-depth over the client-side
 * checkLever()/checkFormat() in lib/limits/policy.ts. The client always runs
 * the same checks first (UX: instant + correct paywall messaging); this route
 * gives a server-signed answer that engines can refuse to honor if the client
 * was tampered with.
 *
 * Pro/Business → always passes (Pro is fail-open per the cached-entitlement
 * rule, same as /api/usage). Free → re-runs the lever check from the same
 * single source of truth (policy.ts). A clone that strips client checks STILL
 * has to call this server route to satisfy the engine refusal — bypass cost
 * goes from "delete one if-statement" to "re-implement the entire engine
 * client-side". Inherits the rate-limit + origin + UA gate from preCheck.
 */

type CheckBody = {
  toolKey?: string;
  // numeric lever check
  lever?: LeverType;
  value?: number;
  // OR format-lever check
  format?: string;
};

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

  let body: CheckBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ allowed: false, reason: 'bad-request' }, { status: 400 });
  }

  const toolKey = body.toolKey;
  if (!toolKey) {
    return NextResponse.json({ allowed: false, reason: 'tool-key-required' }, { status: 400 });
  }

  if (await isPro()) {
    return NextResponse.json({ allowed: true, pro: true });
  }

  const policy = getPolicy(toolKey);
  if (!policy) {
    // No policy = no constraint. Mirrors client behavior.
    return NextResponse.json({ allowed: true });
  }

  // Numeric lever check.
  if (body.lever && typeof body.value === 'number') {
    const lever = policy.levers.find((l) => l.type === body.lever);
    if (!lever) return NextResponse.json({ allowed: true });
    if (body.value <= lever.free) return NextResponse.json({ allowed: true });
    return NextResponse.json({
      allowed: false,
      reason: 'lever-exceeded',
      lever: body.lever,
      free: lever.free,
      observed: body.value,
    });
  }

  // Format whitelist check.
  if (body.format) {
    const lever = policy.levers.find((l) => l.type === 'formats');
    if (!lever || !lever.freeFormats) return NextResponse.json({ allowed: true });
    if (lever.freeFormats.includes(body.format.toLowerCase())) {
      return NextResponse.json({ allowed: true });
    }
    return NextResponse.json({
      allowed: false,
      reason: 'format-pro-only',
      format: body.format,
      free: lever.freeFormats,
    });
  }

  return NextResponse.json({ allowed: false, reason: 'no-check-requested' }, { status: 400 });
}
