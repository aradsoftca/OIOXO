import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/service';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = ['general', 'technical', 'billing', 'feature_request', 'bug_report', 'other'];

function detectPriority(text: string): 'NORMAL' | 'HIGH' | 'URGENT' {
  const t = text.toLowerCase();
  if (['urgent', 'asap', 'critical', 'emergency'].some((k) => t.includes(k))) return 'URGENT';
  if (['bug', 'error', 'broken', 'not working', 'crash'].some((k) => t.includes(k))) return 'HIGH';
  return 'NORMAL';
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; subject?: string; category?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const subject = body.subject?.trim();
  const message = body.message?.trim();
  const category = CATEGORIES.includes(body.category || '') ? body.category! : 'general';

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Name, email, subject and message are required' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  const ipAddress =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const userAgent = req.headers.get('user-agent') || undefined;

  // Rate limit: 5 tickets / hour / IP.
  if (ipAddress !== 'unknown') {
    const recent = await prisma.ticket.count({
      where: { ipAddress, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= 5) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
  }

  const last = await prisma.ticket.findFirst({
    orderBy: { ticketNumber: 'desc' },
    select: { ticketNumber: true },
  });
  const ticketNumber = (last?.ticketNumber ?? 10000) + 1;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      userId,
      name,
      email,
      subject,
      category,
      priority: detectPriority(`${subject} ${message}`),
      ipAddress,
      userAgent,
      messages: { create: { message, isStaff: false } },
    },
  });

  // Confirmation email (best-effort).
  try {
    await sendEmail({
      to: email,
      subject: `We received your request #${ticketNumber} — ${BRAND}`,
      html: `<p>Hi ${name}, thanks for reaching out. Your request <b>#${ticketNumber}</b> ("${subject}") is logged and our team will reply by email.</p>`,
      text: `Hi ${name}, your ${BRAND} support request #${ticketNumber} ("${subject}") is logged. We'll reply by email.`,
      type: 'TRANSACTIONAL',
      userId,
    });
  } catch { /* don't fail ticket creation on email error */ }

  return NextResponse.json({ success: true, ticketNumber, id: ticket.id });
}
