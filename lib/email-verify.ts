import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { IS_OIOXO } from '@/lib/brand';
import { sendVerificationEmail } from '@/lib/email/service';

/**
 * Email verification policy (xonvert only — the oioxo build keeps its old behaviour).
 *
 * Accounts created from VERIFY_REQUIRED_FROM must confirm their email before a password sign-in
 * works. Accounts created earlier were never asked to verify, so they keep signing in unchanged.
 * Google sign-in sets emailVerified itself, so it is never blocked.
 */
export const VERIFY_REQUIRED_FROM = new Date('2026-10-01T03:00:00Z');

/** Error code NextAuth hands back to the sign-in page as `res.error`. */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export function needsVerification(u: { emailVerified: Date | null; createdAt: Date }): boolean {
  return !IS_OIOXO && !u.emailVerified && u.createdAt >= VERIFY_REQUIRED_FROM;
}

/**
 * Issue a fresh 24h verification link and email it. Older unused links for the address are
 * dropped so only the newest one works. Only the SHA-256 of the token is stored (see /api/auth/verify).
 */
export async function issueVerification(email: string, name?: string | null): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token: tokenHash, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  try {
    await sendVerificationEmail(email, token, name ?? undefined);
  } catch (e) {
    // Don't fail the request if the email provider hiccups; the user can ask for a resend.
    console.error('[verify] verification email failed:', (e as Error).message);
  }
}
