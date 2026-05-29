/**
 * Server-side resolver for free-tier daily limits. Reads admin-editable
 * TierLimit rows (tier=FREE) from the DB, cached for 60s, and falls back to the
 * hardcoded GATED_LIMITS defaults. Only the NUMBER is editable — the set of
 * gated categories stays defined by GATED_LIMITS (so isGated stays synchronous).
 */

import { prisma } from '@/lib/db';
import { GATED_LIMITS, GATED_TOOL_LIMITS, limitForKey } from './config';

const TTL = 60_000;
let cache: { at: number; map: Record<string, number> } | null = null;

export async function getFreeLimits(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const map: Record<string, number> = {
    ...(GATED_LIMITS as Record<string, number>),
    ...GATED_TOOL_LIMITS,
  };
  try {
    // Admin can override the NUMBER for any known gate key (category or per-tool).
    const rows = await prisma.tierLimit.findMany({ where: { tier: 'FREE' }, select: { category: true, dailyLimit: true } });
    for (const r of rows) if (r.category in map) map[r.category] = r.dailyLimit;
  } catch { /* DB hiccup → defaults */ }
  cache = { at: Date.now(), map };
  return map;
}

/** Free daily allowance for a gate key (category OR per-tool id). */
export async function getLimitFor(key: string): Promise<number> {
  const map = await getFreeLimits();
  return key in map ? map[key] : limitForKey(key);
}

export function invalidateLimitsCache(): void { cache = null; }
