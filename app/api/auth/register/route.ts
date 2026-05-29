import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email/service';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 5 registrations / hour / IP. Each register runs bcrypt.hash (~250ms cost 12)
// — without throttling a spammer can peg a CPU core indefinitely AND fill the
// User table with junk rows. Bounded sweep lives in lib/rate-limit.
const hits = new Map<string, Bucket>();
function rateLimited(ip: string): boolean {
  return !take(hits, ip, { max: 5, windowMs: 60 * 60 * 1000 });
}

// Tighter than `[^\s@]+@[^\s@]+\.[^\s@]+`: the lax form admits a comma-separated
// pair "a@x.com,b@y.com" because `,` isn't whitespace or `@`. Allowing that into
// the user record would propagate into every email send (verification, reset,
// receipts) and could be parsed as multi-recipient by SMTP libs.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// Same response whether or not the email exists — avoids user enumeration.
const SAFE_OK = {
  success: true,
  message: 'If that email is available, a verification link is on its way.',
};

export async function POST(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many registration attempts. Try again later.' }, { status: 429 });
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const { password, name } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 256) {
    return NextResponse.json({ error: 'Password must be 8–256 characters' }, { status: 400 });
  }
  if (email.length > 254) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Match the latency of a fresh registration (bcrypt hash + ~2 DB writes
    // + email send is ~1s). Without this, the "email already registered"
    // path returns ~10ms vs ~1s for new — enumerable via response timing.
    // bcrypt-against-a-throwaway is the standard equalizer.
    await bcrypt.hash(password, 12).catch(() => undefined);
    return NextResponse.json(SAFE_OK);
  }

  const hashed = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, password: hashed, name: name?.trim() || null, plan: 'FREE' },
    });
  } catch (e) {
    // Race: a concurrent request created this email between the existence
    // check above and our create. Prisma raises P2002 on the unique
    // constraint. Return the enumeration-safe response.
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json(SAFE_OK);
    throw e;
  }

  // Email the plaintext token; store ONLY its SHA-256 hash so a DB read
  // (backup leak, mis-permissioned replica, SQL injection elsewhere) can't
  // verify arbitrary accounts. Mirrors the same defense in /forgot-password.
  // The /verify route hashes the submitted token to look it up.
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.verificationToken.create({
    data: { identifier: email, token: tokenHash, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  try {
    await sendVerificationEmail(email, token, user.name ?? undefined);
  } catch (e) {
    // Don't fail registration if the email provider hiccups.
    console.error('[register] verification email failed:', (e as Error).message);
  }

  return NextResponse.json(SAFE_OK);
}
