import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getGateType, isGatedKey, REWARD_WAIT_SECONDS } from '@/lib/usage/config';
import { getLimitFor } from '@/lib/usage/limits';
import { fingerprints, newCookieId, USAGE_COOKIE, COOKIE_MAX_AGE } from '@/lib/usage/identity';
import { getUsage, hasClaimedReward, incrementUsage } from '@/lib/usage/service';

export const runtime = 'nodejs';

type Action = 'status' | 'consume';

/** PRO/BUSINESS users bypass the gate entirely. */
async function isPro(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return false;
  const user = await prisma.user.findUnique({ where: { id }, select: { plan: true, subscriptionEndsAt: true } });
  // Fail-safe: if Stripe's `customer.subscription.deleted` webhook never
  // fires (Stripe outage, mis-routed endpoint), the stored plan stays PRO
  // forever. Treat a firmly-past subscriptionEndsAt as FREE here so Pro
  // gating closes even when the webhook silently failed. 24h buffer covers
  // webhook lag without stranding a paying user mid-renewal.
  if (user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now()) {
    return false;
  }
  return user?.plan === 'PRO' || user?.plan === 'BUSINESS';
}

export async function POST(req: Request) {
  let body: { category?: string; action?: Action };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  // `category` is the gate KEY — usually a Category, sometimes a per-tool id.
  const category = body.category as string | undefined;
  const action: Action = body.action === 'consume' ? 'consume' : 'status';
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  // Ungated key, or Pro account → always free, never metered.
  if (!isGatedKey(category) || (await isPro())) {
    return NextResponse.json({ gate: 'free', allowed: true, unlimited: true });
  }

  const h = await headers();
  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const freshCookie = !cookieId;
  if (!cookieId) cookieId = newCookieId();

  // The metering DB (usage counts, reward claims) is the only thing that can
  // throw here. If it's unreachable — a dev box with no DATABASE_URL, or a
  // transient prod DB blip — DON'T 500: that fail-CLOSES the client gate and
  // hard-blocks the user from a free action they're entitled to. Fail OPEN
  // instead (treat as within the free allowance). A metering outage must never
  // brick the product; worst case we under-count usage during the outage.
  let gate: ReturnType<typeof getGateType>;
  let usage: number;
  let freeLimit: number;
  try {
    const fps = fingerprints(h, cookieId);
    freeLimit = await getLimitFor(category);
    usage = await getUsage(fps, category);
    const claimed = await hasClaimedReward(fps, category);
    gate = getGateType(usage, freeLimit, claimed);
    if (action === 'consume' && gate === 'free') {
      await incrementUsage(fps, category, undefined);
    }
  } catch {
    return NextResponse.json({ gate: 'free', allowed: true, unlimited: true, degraded: true });
  }

  const res = NextResponse.json({
    gate,
    allowed: action === 'consume' && gate === 'free',
    used: usage,
    limit: freeLimit,
    rewardWaitSeconds: REWARD_WAIT_SECONDS,
  });
  if (freshCookie) {
    res.cookies.set(USAGE_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }
  return res;
}
