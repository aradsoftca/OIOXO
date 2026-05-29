import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { isGatedKey, REWARD_WAIT_SECONDS } from '@/lib/usage/config';
import { fingerprints, newCookieId, USAGE_COOKIE, COOKIE_MAX_AGE } from '@/lib/usage/identity';
import { completeReward, startReward } from '@/lib/usage/service';

export const runtime = 'nodejs';

type Action = 'start' | 'complete';

export async function POST(req: Request) {
  let body: { category?: string; action?: Action };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const category = body.category as string | undefined;
  const action: Action = body.action === 'complete' ? 'complete' : 'start';
  if (!category || !isGatedKey(category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }

  const h = await headers();
  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const freshCookie = !cookieId;
  if (!cookieId) cookieId = newCookieId();
  const fps = fingerprints(h, cookieId);

  let payload: Record<string, unknown>;
  if (action === 'start') {
    await startReward(fps, category);
    payload = { started: true, secondsRemaining: REWARD_WAIT_SECONDS };
  } else {
    payload = await completeReward(fps, category);
  }

  const res = NextResponse.json(payload);
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
