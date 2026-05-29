import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/auth/verify?token=... — confirm an email and redirect to sign-in.
// (We redirect rather than auto-login to avoid session-cookie-name pitfalls
// under the production __Secure- prefix; the user signs in once, verified.)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const base = process.env.NEXTAUTH_URL || url.origin;

  if (!token) return NextResponse.redirect(`${base}/auth/sign-in?error=missing_token`);

  // The DB stores SHA-256(token), not the plaintext — match by hash. Without
  // this, a DB read leak (backup, mis-permissioned replica, SQL injection
  // elsewhere) reveals every pending verification token, letting an attacker
  // verify arbitrary accounts. Mirrors the same defense in /forgot-password.
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const vt = await prisma.verificationToken.findUnique({ where: { token: tokenHash } });
  if (!vt) return NextResponse.redirect(`${base}/auth/sign-in?error=invalid_token`);

  if (vt.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token: tokenHash } });
    return NextResponse.redirect(`${base}/auth/sign-in?error=expired_token`);
  }

  // updateMany so a deleted-account race (user removed between sign-up and
  // clicking the email link) doesn't 500 this handler and leak the token
  // sitting in the DB.
  await prisma.user.updateMany({
    where: { email: vt.identifier },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.deleteMany({ where: { token: tokenHash } });

  return NextResponse.redirect(`${base}/auth/sign-in?verified=1`);
}
