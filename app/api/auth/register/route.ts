import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email/service';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same response whether or not the email exists — avoids user enumeration.
const SAFE_OK = {
  success: true,
  message: 'If that email is available, a verification link is on its way.',
};

export async function POST(req: Request) {
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
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json(SAFE_OK);

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, name: name?.trim() || null, plan: 'FREE' },
  });

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  try {
    await sendVerificationEmail(email, token, user.name ?? undefined);
  } catch (e) {
    // Don't fail registration if the email provider hiccups.
    console.error('[register] verification email failed:', (e as Error).message);
  }

  return NextResponse.json(SAFE_OK);
}
