import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/admin/contact?status=UNREAD — list contact messages (newest first).
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const status = new URL(req.url).searchParams.get('status') || undefined;
  const messages = await prisma.contactMessage.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ messages });
}
