import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/tickets/[id] — the ticket thread, visible to its owner or an admin.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const isOwner = uid && ticket.userId && uid === ticket.userId;
  if (!isOwner && !(await getAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ticket });
}
