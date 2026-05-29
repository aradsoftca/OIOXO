/**
 * Postgres-backed usage + reward metering (no Redis).
 *
 * Usage and reward state is keyed by a composite fingerprint set (see
 * identity.ts) and a UTC date. We read across all fingerprints and take the
 * max, and write to all of them, so neither cookie-clearing nor IP-switching
 * resets the count.
 */

import { prisma } from '@/lib/db';
import { REWARD_WAIT_SECONDS } from './config';

/** Today at UTC midnight — matches the @db.Date columns. */
export function utcToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getUsage(fps: string[], category: string): Promise<number> {
  const rows = await prisma.categoryUsage.findMany({
    where: { fingerprint: { in: fps }, category, date: utcToday() },
    select: { count: true },
  });
  return rows.reduce((m, r) => Math.max(m, r.count), 0);
}

export async function incrementUsage(
  fps: string[],
  category: string,
  userId?: string,
): Promise<void> {
  const date = utcToday();
  await Promise.all(
    fps.map((fp) =>
      prisma.categoryUsage.upsert({
        where: { fingerprint_category_date: { fingerprint: fp, category, date } },
        create: { fingerprint: fp, category, date, userId, count: 1 },
        update: { count: { increment: 1 } },
      }),
    ),
  );
}

/**
 * Add N seconds of usage to a TIME-metered category (e.g. the OIOXO coding agent).
 * Reuses categoryUsage.count as accumulated seconds for the day. Clamps the per-call
 * amount so a buggy/forged client can't burn the allowance in one shot.
 */
export async function addSeconds(
  fps: string[],
  category: string,
  seconds: number,
  userId?: string,
): Promise<void> {
  const amount = Math.max(0, Math.min(Math.round(seconds), 600)); // ≤10 min per report
  if (amount === 0) return;
  const date = utcToday();
  await Promise.all(
    fps.map((fp) =>
      prisma.categoryUsage.upsert({
        where: { fingerprint_category_date: { fingerprint: fp, category, date } },
        create: { fingerprint: fp, category, date, userId, count: amount },
        update: { count: { increment: amount } },
      }),
    ),
  );
}

/**
 * Whether the 30s reward was granted today for this category. Auto-completes a
 * timer that started ≥30s ago (covers a client whose "complete" call was lost).
 */
export async function hasClaimedReward(fps: string[], category: string): Promise<boolean> {
  const rows = await prisma.rewardClaim.findMany({
    where: { fingerprint: { in: fps }, category, date: utcToday() },
  });
  if (rows.some((r) => r.claimedAt)) return true;
  const ready = rows.find(
    (r) => Date.now() - r.startedAt.getTime() >= REWARD_WAIT_SECONDS * 1000,
  );
  if (ready) {
    await prisma.rewardClaim.updateMany({
      where: { fingerprint: { in: fps }, category, date: utcToday(), claimedAt: null },
      data: { claimedAt: new Date() },
    });
    return true;
  }
  return false;
}

/** Start the server-side 30s timer (idempotent — keeps the earliest start). */
export async function startReward(fps: string[], category: string): Promise<void> {
  const date = utcToday();
  await Promise.all(
    fps.map((fp) =>
      prisma.rewardClaim.upsert({
        where: { fingerprint_category_date: { fingerprint: fp, category, date } },
        create: { fingerprint: fp, category, date },
        update: {},
      }),
    ),
  );
}

/** Verify ≥30s elapsed, then grant. Returns remaining seconds if not yet ready. */
export async function completeReward(
  fps: string[],
  category: string,
): Promise<{ success: boolean; secondsRemaining: number }> {
  const date = utcToday();
  const rows = await prisma.rewardClaim.findMany({
    where: { fingerprint: { in: fps }, category, date },
  });
  if (rows.some((r) => r.claimedAt)) return { success: true, secondsRemaining: 0 };
  if (!rows.length) {
    await startReward(fps, category);
    return { success: false, secondsRemaining: REWARD_WAIT_SECONDS };
  }
  const earliest = Math.min(...rows.map((r) => r.startedAt.getTime()));
  const elapsed = (Date.now() - earliest) / 1000;
  if (elapsed < REWARD_WAIT_SECONDS) {
    return { success: false, secondsRemaining: Math.ceil(REWARD_WAIT_SECONDS - elapsed) };
  }
  await prisma.rewardClaim.updateMany({
    where: { fingerprint: { in: fps }, category, date, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return { success: true, secondsRemaining: 0 };
}
