import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 10 attempts / 15 min / IP. Tokens are 32 hex chars (128 bits) so brute-force
// is impractical, but unprotected POSTs let an attacker burn DB queries +
// bcrypt CPU. Matches the forgot-password endpoint's protection.
const hits = new Map<string, Bucket>();

export async function POST(req: Request) {
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
  if (!take(hits, ip, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  let token: string | undefined;
  let password: string | undefined;
  try {
    ({ token, password } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 256) {
    return NextResponse.json({ error: 'Password must be 8–256 characters' }, { status: 400 });
  }

  // The DB stores SHA-256(token), not the plaintext token — match by hash.
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findFirst({
    where: { resetToken: tokenHash, resetTokenExpiry: { gt: new Date() } },
  });
  if (!user) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 12),
      resetToken: null,
      resetTokenExpiry: null,
      emailVerified: user.emailVerified ?? new Date(), // resetting via emailed link proves ownership
    },
  });

  return NextResponse.json({ success: true });
}
