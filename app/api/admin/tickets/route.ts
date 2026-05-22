import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/admin/tickets?status=OPEN — list tickets (newest first).
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const status = new URL(req.url).searchParams.get('status') || undefined;
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
