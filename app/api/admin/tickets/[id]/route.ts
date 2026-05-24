import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';
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

  const message = body.message?.trim();
  const VALID = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];
  const status = body.status && VALID.includes(body.status) ? body.status : undefined;

  if (message) {
    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        message,
        isStaff: true,
        staffName: body.staffName || `${BRAND} Support`,
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
      await sendTicketReplyEmail(ticket.email, ticket.name, ticket.ticketNumber, message, url, ticket.userId ?? undefined);
    } catch { /* don't fail the reply on email error */ }
  }

  return NextResponse.json({ success: true });
}
