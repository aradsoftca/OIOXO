import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyUnsubscribe } from '@/lib/email/unsubscribe';

export const runtime = 'nodejs';

// POST { email, token } — opt an address out of marketing email. Enumeration-safe:
// always returns success, only acts on a valid token for an existing user.
export async function POST(req: Request) {
  let email = '', token = '';
  try {
    const b = await req.json();
    email = String(b.email || '').trim().toLowerCase();
    token = String(b.token || '');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!email || !token || !verifyUnsubscribe(email, token)) {
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 400 });
  }
  await prisma.user.updateMany({ where: { email }, data: { marketingOptOut: true } });
  return NextResponse.json({ success: true });
}
