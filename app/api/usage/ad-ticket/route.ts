import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { isGatedKey } from '@/lib/usage/config';
import { fingerprints, newCookieId, USAGE_COOKIE, COOKIE_MAX_AGE } from '@/lib/usage/identity';
import { signTicket } from '@/lib/usage/ad-reward';

export const runtime = 'nodejs';

/** Signed ticket the app attaches to a rewarded ad (see lib/usage/ad-reward.ts). */
export async function POST(req: Request) {
  let body: { category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const category = body.category;
  if (!category || !isGatedKey(category)) return NextResponse.json({ error: 'invalid category' }, { status: 400 });

  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const fresh = !cookieId;
  if (!cookieId) cookieId = newCookieId();
  const res = NextResponse.json({ ticket: signTicket(fingerprints(await headers(), cookieId), category) });
  if (fresh) {
    res.cookies.set(USAGE_COOKIE, cookieId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: COOKIE_MAX_AGE, path: '/',
    });
  }
  return res;
}
