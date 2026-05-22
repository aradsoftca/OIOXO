import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
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
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
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
