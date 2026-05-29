import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin, logAudit } from '@/lib/admin';

export const runtime = 'nodejs';

const PLANS = ['FREE', 'PRO', 'BUSINESS'];
const ROLES = ['USER', 'ADMIN'];
const SUB = ['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE'];

// POST /api/admin/users/[id] — update plan / role / subscription / limits.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let body: {
    plan?: string; role?: string; subscriptionStatus?: string;
    dailyConversionLimit?: number | null; maxFileSize?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.plan && PLANS.includes(body.plan)) data.plan = body.plan;
  if (body.role && ROLES.includes(body.role)) data.role = body.role;
  if (body.subscriptionStatus && SUB.includes(body.subscriptionStatus)) data.subscriptionStatus = body.subscriptionStatus;
  // Numeric limits: accept null (= use default) or a finite non-negative
  // integer within a sane ceiling. Previously any number went through, so a
  // fat-finger could set a multi-TB cap or a negative daily limit.
  const isValidLimit = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (body.dailyConversionLimit !== undefined) {
    if (!isValidLimit(body.dailyConversionLimit) ||
        (typeof body.dailyConversionLimit === 'number' && body.dailyConversionLimit > 100_000)) {
      return NextResponse.json({ error: 'dailyConversionLimit must be 0–100000 or null' }, { status: 400 });
    }
    data.dailyConversionLimit = body.dailyConversionLimit;
  }
  if (body.maxFileSize !== undefined) {
    // Cap at 10 GiB.
    if (!isValidLimit(body.maxFileSize) ||
        (typeof body.maxFileSize === 'number' && body.maxFileSize > 10 * 1024 * 1024 * 1024)) {
      return NextResponse.json({ error: 'maxFileSize must be 0–10 GiB or null' }, { status: 400 });
    }
    data.maxFileSize = body.maxFileSize;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Guard: an admin can't strip their own ADMIN role (avoids self-lockout).
  if (data.role === 'USER' && id === admin.id) {
    return NextResponse.json({ error: "You can't remove your own admin role." }, { status: 400 });
  }

  const user = await prisma.user.update({ where: { id }, data });
  await logAudit(admin, 'user.update', 'User', id, data);

  return NextResponse.json({
    success: true,
    user: { id: user.id, plan: user.plan, role: user.role, subscriptionStatus: user.subscriptionStatus },
  });
}
