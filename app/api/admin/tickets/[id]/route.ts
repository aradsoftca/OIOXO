import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin, logAudit } from '@/lib/admin';
import { sendTicketReplyEmail } from '@/lib/email/service';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';

// GET /api/admin/tickets/[id] — full ticket + thread.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ticket });
}

// POST /api/admin/tickets/[id] — staff reply (+ email) and/or status change.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let body: { message?: string; status?: string; staffName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Cap the reply at 50KB. Without this, a buggy admin UI (or a compromised
  // admin account) could ship a multi-MB body that lands in TicketMessage,
  // gets echoed into the customer's email, and inflates DB rows / email
  // payload size to unworkable sizes.
  const rawMessage = body.message?.trim();
  const message = rawMessage && rawMessage.length > 50_000 ? rawMessage.slice(0, 50_000) : rawMessage;
  const VALID = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];
  const status = body.status && VALID.includes(body.status) ? body.status : undefined;
  // Cap staffName too — it lands in the ticket thread as displayed sender.
  const staffName = (body.staffName || `${BRAND} Support`).slice(0, 128);

  if (message) {
    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        message,
        isStaff: true,
        staffName,
      },
    });
  }

  await prisma.ticket.update({
    where: { id },
    data: {
      // A staff reply moves OPEN tickets to WAITING_USER unless an explicit
      // status was provided.
      status: (status as never) ?? (message ? ('WAITING_USER' as never) : undefined),
      ...(status === 'CLOSED' || status === 'RESOLVED' ? { closedAt: new Date() } : {}),
    },
  });

  // Email the requester their reply (best-effort).
  if (message) {
    const url = `${process.env.NEXTAUTH_URL}/support/${id}`;
    try {
      // Migrated tickets (France import) predate the comma-email tightening
      // in Pass 91 — `ticket.email` could still be a multi-recipient string
      // like "a@evil.com,b@victim.com". Take only the first address before
      // anything past `,` or `;` so an admin reply (containing private support
      // context) doesn't end up exfiltrated to an attacker's address.
      const safeTo = ticket.email.split(/[,;]/)[0].trim();
      await sendTicketReplyEmail(safeTo, ticket.name, ticket.ticketNumber, message, url, ticket.userId ?? undefined);
    } catch { /* don't fail the reply on email error */ }
  }

  // Audit-log staff replies + status changes (other admin write routes do
  // this; this one didn't, leaving a gap in the audit trail).
  await logAudit(admin, 'ticket.update', 'Ticket', id, { hasReply: !!message, status });

  return NextResponse.json({ success: true });
}
