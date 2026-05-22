import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Category } from '@/lib/registry/types';
import { getGateType, isGated, REWARD_WAIT_SECONDS } from '@/lib/usage/config';
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
  const user = await prisma.user.findUnique({ where: { id }, select: { plan: true } });
  return user?.plan === 'PRO' || user?.plan === 'BUSINESS';
}

export async function POST(req: Request) {
  let body: { category?: string; action?: Action };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const category = body.category as Category | undefined;
  const action: Action = body.action === 'consume' ? 'consume' : 'status';
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  // Ungated category, or Pro account → always free, never metered.
  if (!isGated(category) || (await isPro())) {
    return NextResponse.json({ gate: 'free', allowed: true, unlimited: true });
  }

  const h = await headers();
  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const freshCookie = !cookieId;
  if (!cookieId) cookieId = newCookieId();

  const fps = fingerprints(h, cookieId);
  const freeLimit = await getLimitFor(category);
  const usage = await getUsage(fps, category);
  const claimed = await hasClaimedReward(fps, category);
  const gate = getGateType(usage, freeLimit, claimed);

  let allowed = false;
  if (action === 'consume' && gate === 'free') {
    await incrementUsage(fps, category, undefined);
    allowed = true;
  }

  const res = NextResponse.json({
    gate,
    allowed,
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
