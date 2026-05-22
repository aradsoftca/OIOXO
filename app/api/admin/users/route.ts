import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/admin/users?q=search — list/search users (newest first).
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q')?.trim();
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, email: true, name: true, plan: true, role: true,
      subscriptionStatus: true, subscriptionEndsAt: true,
      stripeCustomerId: true, dailyConversionLimit: true, maxFileSize: true,
      createdAt: true, lastLoginAt: true,
    },
  });
  return NextResponse.json({ users });
}
