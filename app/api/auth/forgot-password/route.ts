import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email/service';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Per-instance limit: 3 / 15 min / IP. Bounded sweep lives in lib/rate-limit.
const hits = new Map<string, Bucket>();
function rateLimited(ip: string): boolean {
  return !take(hits, ip, { max: 3, windowMs: 15 * 60 * 1000 });
}

export async function POST(req: Request) {
  let email: string | undefined;
  try {
    email = (await req.json())?.email?.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success (no user enumeration). Only act if the user exists
  // and has a password (OAuth-only accounts can't reset a password).
  if (user?.password) {
    const recent =
      user.resetTokenExpiry && user.resetTokenExpiry > new Date(Date.now() - 5 * 60 * 1000);
    if (!recent) {
      // Email the plaintext token; store ONLY its SHA-256 hash so a DB read
      // (backup leak, mis-permissioned replica) can't reveal an in-flight
      // reset. reset-password hashes the submitted token to match.
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: tokenHash, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      try {
        // Migrated user rows (France import) predate Pass 91's EMAIL_RE tightening
        // — `user.email` could still be a multi-recipient string like
        // "a@evil.com,b@victim.com". The submitter would match that row exactly
        // (case-insensitive lookup), and SMTP would deliver the reset link to
        // both addresses, letting an attacker phish the victim with a real link
        // from a trusted sender. Take only the first address.
        const safeTo = email.split(/[,;]/)[0].trim();
        await sendPasswordResetEmail(safeTo, token, user.name ?? undefined);
      } catch (e) {
        console.error('[forgot-password] email failed:', (e as Error).message);
      }
    }
  } else {
    // Constant-ish timing to blunt enumeration via response latency.
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));
  }

  return NextResponse.json({ success: true });
}
