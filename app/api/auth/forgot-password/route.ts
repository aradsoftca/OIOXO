import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email/service';

export const runtime = 'nodejs';

// Best-effort in-memory rate limit (per server instance): 3 / 15 min / IP.
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.reset) {
    hits.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return false;
  }
  if (e.count >= 3) return true;
  e.count++;
  return false;
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
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      try {
        await sendPasswordResetEmail(email, token, user.name ?? undefined);
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
