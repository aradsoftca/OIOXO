// Anonymous funnel counters. Stores only (day, event) -> count: no user id,
// IP, cookie or fingerprint, so "no tracking" stays true. GET is admin-only.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/admin';
import { take, type Bucket } from '@/lib/rate-limit';
import { FUNNEL_EVENTS, type FunnelEvent } from '@/lib/funnel-events';
import { countFunnel } from '@/lib/funnel-server';

const buckets = new Map<string, Bucket>();

export async function POST(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'anon';
  // The key is only for rate limiting in memory; it is never stored.
  if (!take(buckets, ip, { max: 60, windowMs: 60_000 })) return new NextResponse(null, { status: 204 });
  let event: unknown;
  try { event = (await req.json())?.event; } catch { /* */ }
  if (typeof event !== 'string' || !(FUNNEL_EVENTS as readonly string[]).includes(event)) {
    return new NextResponse(null, { status: 204 });
  }
  await countFunnel(event as FunnelEvent);
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await prisma.funnelDay.findMany({ where: { date: { gte: since } }, orderBy: [{ date: 'desc' }, { event: 'asc' }] });
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.event] = (totals[r.event] ?? 0) + r.count;
  return NextResponse.json({ since, totals, rows });
}
