import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPolicy } from '@/lib/limits/policy';
import { fingerprints, newCookieId, USAGE_COOKIE, COOKIE_MAX_AGE } from '@/lib/usage/identity';
import { utcToday } from '@/lib/usage/service';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side cross-tab session-cap enforcement — closes the "open 3 tabs to
 * triple the cap" loophole that an in-tab JS timer can't see.
 *
 * Every tab that's in a live session (Watch/Call/etc.) heartbeats here every
 * ~20s. The server keeps a SINGLE running total per identity-per-day-per-tool,
 * and ONLY adds the wall-clock delta since the last heartbeat (capped) — so
 * three concurrent tabs share one budget, refresh doesn't reset it, and an
 * idle tab can't drain it. When the running total crosses the policy's
 * `session-minutes` lever, the response sets `expired: true` and every tab
 * stops in lockstep.
 *
 * Identity follows the same cookie+IP composite as /api/usage so neither
 * cookie-clearing nor VPN-switching resets the budget. Pro users are always
 * { expired: false, remainingSec: Infinity } — fail-open cached entitlement.
 *
 * Storage reuses CategoryUsage (date-keyed, no migration required):
 *   • `<toolKey>:sec`   — accumulated session seconds today
 *   • `<toolKey>:last`  — seconds-since-UTC-midnight at the last heartbeat
 *                         (so we can compute the wall-clock delta safely)
 */

async function isProUser(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return false;
  const user = await prisma.user.findUnique({ where: { id }, select: { plan: true, subscriptionEndsAt: true } });
  // Fail-safe: if Stripe's subscription.deleted webhook never lands, the
  // stored plan stays PRO forever. Past-period users gate as FREE here.
  if (user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now()) return false;
  return user?.plan === 'PRO' || user?.plan === 'BUSINESS';
}

function secondsSinceUtcMidnight(): number {
  const now = new Date();
  const m = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((now.getTime() - m) / 1000);
}

export async function POST(req: Request) {
  // Rate-limit + Origin + UA pre-check (same as the key endpoints).
  const pre = preCheckRequest(req);
  if (pre) return pre;

  let body: { toolKey?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  const toolKey = body.toolKey;
  if (!toolKey) return NextResponse.json({ error: 'tool-key-required' }, { status: 400 });

  // Pro fail-open — never block paying users on a transient cap check.
  if (await isProUser()) {
    return NextResponse.json({ expired: false, remainingSec: Number.MAX_SAFE_INTEGER, pro: true });
  }

  const policy = getPolicy(toolKey);
  const lever = policy?.levers.find((l) => l.type === 'session-minutes');
  if (!lever) {
    // No cap declared → allow forever (the route's still useful for telemetry).
    return NextResponse.json({ expired: false, remainingSec: Number.MAX_SAFE_INTEGER });
  }
  const capSec = lever.free * 60;

  // Composite anonymous identity (same as /api/usage).
  const h = await headers();
  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const freshCookie = !cookieId;
  if (!cookieId) cookieId = newCookieId();
  const fps = fingerprints(h, cookieId);
  const date = utcToday();

  const SEC_KEY = `${toolKey}:sec`;
  const LAST_KEY = `${toolKey}:last`;
  const nowSecsSinceMidnight = secondsSinceUtcMidnight();

  // Read existing buckets across all fingerprints; take MAX (identity bypass-resistant).
  const [secRows, lastRows] = await Promise.all([
    prisma.categoryUsage.findMany({
      where: { fingerprint: { in: fps }, category: SEC_KEY, date },
      select: { count: true },
    }),
    prisma.categoryUsage.findMany({
      where: { fingerprint: { in: fps }, category: LAST_KEY, date },
      select: { count: true },
    }),
  ]);
  const totalSec = secRows.reduce((m, r) => Math.max(m, r.count), 0);
  const lastSec = lastRows.reduce((m, r) => Math.max(m, r.count), 0);

  // Wall-clock delta since the last heartbeat, capped at 30s so an idle/abandoned
  // tab can't drain the budget — and a clock skew can't burn it either.
  const delta = lastSec > 0 && nowSecsSinceMidnight > lastSec
    ? Math.min(30, nowSecsSinceMidnight - lastSec)
    : 0;
  const newTotal = totalSec + delta;

  // Persist new totals + last-active marker on EVERY fingerprint so the next
  // heartbeat from any identity-equivalent path sees the same state.
  await Promise.all([
    ...fps.map((fp) =>
      prisma.categoryUsage.upsert({
        where: { fingerprint_category_date: { fingerprint: fp, category: SEC_KEY, date } },
        create: { fingerprint: fp, category: SEC_KEY, date, count: newTotal },
        update: { count: newTotal },
      }),
    ),
    ...fps.map((fp) =>
      prisma.categoryUsage.upsert({
        where: { fingerprint_category_date: { fingerprint: fp, category: LAST_KEY, date } },
        create: { fingerprint: fp, category: LAST_KEY, date, count: nowSecsSinceMidnight },
        update: { count: nowSecsSinceMidnight },
      }),
    ),
  ]);

  const remainingSec = Math.max(0, capSec - newTotal);
  const expired = newTotal >= capSec;
  const res = NextResponse.json({
    expired,
    remainingSec,
    usedSec: newTotal,
    capSec,
    capMin: lever.free,
    proCap: lever.pro,
  });
  if (freshCookie) {
    res.cookies.set(USAGE_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }
  return res;
}
