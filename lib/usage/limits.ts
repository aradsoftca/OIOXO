/**
 * Server-side resolver for free-tier daily limits. Reads admin-editable
 * TierLimit rows (tier=FREE) from the DB, cached for 60s, and falls back to the
 * hardcoded GATED_LIMITS defaults. Only the NUMBER is editable — the set of
 * gated categories stays defined by GATED_LIMITS (so isGated stays synchronous).
 */

import { prisma } from '@/lib/db';
import { GATED_LIMITS } from './config';
import type { Category } from '@/lib/registry/types';

const TTL = 60_000;
let cache: { at: number; map: Record<string, number> } | null = null;

export async function getFreeLimits(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const map: Record<string, number> = { ...(GATED_LIMITS as Record<string, number>) };
  try {
    const rows = await prisma.tierLimit.findMany({ where: { tier: 'FREE' }, select: { category: true, dailyLimit: true } });
    for (const r of rows) if (r.category in GATED_LIMITS) map[r.category] = r.dailyLimit;
  } catch { /* DB hiccup → defaults */ }
  cache = { at: Date.now(), map };
  return map;
}

export async function getLimitFor(category: Category): Promise<number> {
  const map = await getFreeLimits();
  return category in map ? map[category] : Infinity;
}

export function invalidateLimitsCache(): void { cache = null; }
