import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/admin/stats — dashboard counts.
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [users, pro, openTickets, unreadContacts, payments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { plan: 'PRO' } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } } }),
    prisma.contactMessage.count({ where: { status: { in: ['UNREAD', 'READ', 'IN_PROGRESS'] } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCEEDED' } }),
  ]);

  return NextResponse.json({
    users,
    pro,
    openTickets,
    unreadContacts,
    revenue: payments._sum.amount ?? 0,
  });
}
