import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

const CONTACT_STATUSES = ['UNREAD', 'READ', 'IN_PROGRESS', 'REPLIED', 'ARCHIVED'] as const;

// GET /api/admin/contact?status=UNREAD — list contact messages (newest first).
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // Validate against the known enum — an unknown value (typo, stale link)
  // would otherwise surface as a Prisma 500 to the admin UI.
  const raw = new URL(req.url).searchParams.get('status') || '';
  const status = (CONTACT_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
  const messages = await prisma.contactMessage.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ messages });
}
