import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin, logAudit } from '@/lib/admin';
import { GATED_LIMITS } from '@/lib/usage/config';
import { getFreeLimits, invalidateLimitsCache } from '@/lib/usage/limits';

export const runtime = 'nodejs';

const GATED = Object.keys(GATED_LIMITS); // editable categories

// GET — current effective FREE daily limits per gated category.
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const map = await getFreeLimits();
  return NextResponse.json({
    categories: GATED.map((c) => ({ category: c, dailyLimit: map[c] ?? 1, default: (GATED_LIMITS as Record<string, number>)[c] })),
  });
}

// POST { limits: { [category]: number } } — upsert FREE TierLimit rows.
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let limits: Record<string, number>;
  try {
    limits = (await req.json()).limits || {};
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const updates = Object.entries(limits)
    .filter(([cat]) => GATED.includes(cat))
    .map(([category, raw]) => ({ category, dailyLimit: Math.max(0, Math.min(100000, Math.round(Number(raw) || 0))) }));

  for (const u of updates) {
    await prisma.tierLimit.upsert({
      where: { tier_category: { tier: 'FREE', category: u.category } },
      create: { tier: 'FREE', category: u.category, dailyLimit: u.dailyLimit, maxFileSize: 104857600 },
      update: { dailyLimit: u.dailyLimit },
    });
  }
  await logAudit(admin, 'limits.update', 'TierLimit', 'FREE', limits);
  invalidateLimitsCache();
  return NextResponse.json({ success: true });
}
