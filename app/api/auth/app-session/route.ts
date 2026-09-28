import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { appTokenSecret, verifyAppToken } from '@/lib/oioxo/app-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AGE = 30 * 24 * 60 * 60; // NextAuth's default session length

/**
 * The Xonvert mobile app signs in natively (Google on Android, email) through
 * /api/auth/app-google or /api/auth/app-login and gets an app bearer token. The
 * tools run as web pages inside the app's WebView, and those recognise a user by
 * the NextAuth session cookie — so the app POSTs its bearer here once and gets the
 * same session cookie a web sign-in would set. The jwt callback in lib/auth.ts
 * re-reads plan/role from the database on every request, so Pro applies live.
 */
export async function POST(req: Request) {
  const secret = appTokenSecret();
  const nextSecret = process.env.NEXTAUTH_SECRET;
  if (!secret || !nextSecret) return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const { ok, claims } = await verifyAppToken(body.token || '', secret);
  if (!ok || !claims) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, email: true, name: true } });
  if (!user) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  const session = await encode({
    token: { sub: user.id, uid: user.id, email: user.email, name: user.name },
    secret: nextSecret,
    maxAge: MAX_AGE,
  });
  const secure = (process.env.NEXTAUTH_URL || '').startsWith('https://');
  const res = NextResponse.json({ ok: true, email: user.email });
  res.cookies.set(secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token', session, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE,
  });
  return res;
}
