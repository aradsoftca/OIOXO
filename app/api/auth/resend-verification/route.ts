import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { issueVerification, needsVerification } from '@/lib/email-verify';
import { take, type Bucket } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 5 / hour / IP and 3 / hour / address: each call sends an email.
const ipHits = new Map<string, Bucket>();
const emailHits = new Map<string, Bucket>();

// Same answer whether or not the address exists or is already verified (no enumeration).
const SAFE_OK = { success: true, message: 'If that account is waiting for confirmation, a new link is on its way.' };

/** POST { email } → send a fresh verification link to an account that still needs one. */
export async function POST(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  if (!take(ipHits, ip, { max: 5, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  let body: { email?: string } = {};
  try { body = await req.json(); } catch { /* rejected below */ }
  const email = body.email?.trim().toLowerCase();
  if (!email || email.length > 254) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  if (!take(emailHits, email, { max: 3, windowMs: 60 * 60 * 1000 })) return NextResponse.json(SAFE_OK);

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && needsVerification(user)) await issueVerification(email, user.name);
  return NextResponse.json(SAFE_OK);
}
