import { NextResponse } from 'next/server';
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

  const vt = await prisma.verificationToken.findUnique({ where: { token } });
  if (!vt) return NextResponse.redirect(`${base}/auth/sign-in?error=invalid_token`);

  if (vt.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token } });
    return NextResponse.redirect(`${base}/auth/sign-in?error=expired_token`);
  }

  await prisma.user.update({
    where: { email: vt.identifier },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.deleteMany({ where: { token } });

  return NextResponse.redirect(`${base}/auth/sign-in?verified=1`);
}
