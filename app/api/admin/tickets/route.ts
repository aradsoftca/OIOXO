import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'] as const;

// GET /api/admin/tickets?status=OPEN — list tickets (newest first).
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Validate the status against the known enum so a typo or stale link
  // doesn't bubble up as a Prisma 500. Unknown value → ignore the filter
  // and return everything (same as no status param).
  const raw = new URL(req.url).searchParams.get('status') || '';
  const status = (TICKET_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
  const tickets = await prisma.ticket.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, ticketNumber: true, name: true, email: true, subject: true,
      category: true, priority: true, status: true, createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json({ tickets });
}
