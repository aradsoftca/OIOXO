import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/service';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';

// Email regex deliberately tighter than `[^\s@]+@[^\s@]+\.[^\s@]+`: the lax
// form admits a comma-separated pair like "a@evil.com,b@victim.com" because
// `,` isn't whitespace or `@`. SMTP libraries then parse that as a multi-
// recipient `to` header — so a hostile submitter could later receive copies
// of every staff reply addressed to a different account (exfiltration of
// admin-side support context). Restrict to RFC-ish single-address chars.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
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
  // Cap every user-controlled field so a hostile client can't ship a 10MB
  // message (or display name) into the Ticket table or the confirmation
  // email body. Values are still HTML-escaped before going into the email
  // HTML below; the caps are about DB row + email payload size.
  const name = body.name?.trim().slice(0, 200);
  const email = body.email?.trim().toLowerCase().slice(0, 254);
  const subject = body.subject?.trim().slice(0, 500);
  const message = body.message?.trim().slice(0, 10_000);
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

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  // Ticket-number generation: retry on unique-constraint violation. Two
  // concurrent requests previously read the same max and wrote the same
  // ticketNumber → the second one threw P2002 and the user got a 500.
  // The loop converges quickly under realistic load.
  let ticket: { id: string; ticketNumber: number } | null = null;
  for (let attempt = 0; attempt < 10 && !ticket; attempt++) {
    const last = await prisma.ticket.findFirst({
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    // Jitter the attempt-offset so two writers retrying simultaneously don't
    // collide on the same retry number — the deterministic `+ attempt` made
    // 5 concurrent submitters all converge to the same (last + 1) on retry 0,
    // then all to (last + 2) on retry 1, etc. With random jitter, attempt > 0
    // spreads across a 32-wide window so collisions resolve quickly.
    const offset = attempt === 0 ? 1 : 1 + Math.floor(Math.random() * 32);
    const ticketNumber = (last?.ticketNumber ?? 10000) + offset;
    try {
      ticket = await prisma.ticket.create({
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
        select: { id: true, ticketNumber: true },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      // Unique constraint hit → another writer claimed this number; retry.
    }
  }
  if (!ticket) {
    return NextResponse.json({ error: 'Could not assign a ticket number. Please retry.' }, { status: 503 });
  }
  const ticketNumber = ticket.ticketNumber;

  // Confirmation email (best-effort). HTML-escape user-controlled fields and
  // strip newlines from header-style values to defeat HTML injection / email
  // header injection. The previous version interpolated `name` and `subject`
  // raw into the HTML body — a malicious display name could ship a phishing
  // payload to the ticket submitter (e.g. an attacker triggering a support
  // confirmation to a victim's address).
  try {
    const esc = (s: string) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);
    await sendEmail({
      to: email,
      subject: `We received your request #${ticketNumber} — ${BRAND}`,
      html: `<p>Hi ${esc(name)}, thanks for reaching out. Your request <b>#${ticketNumber}</b> ("${esc(subject)}") is logged and our team will reply by email.</p>`,
      text: `Hi ${oneLine(name)}, your ${BRAND} support request #${ticketNumber} ("${oneLine(subject)}") is logged. We'll reply by email.`,
      type: 'TRANSACTIONAL',
      userId,
    });
  } catch { /* don't fail ticket creation on email error */ }

  return NextResponse.json({ success: true, ticketNumber, id: ticket.id });
}
