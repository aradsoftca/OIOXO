/**
 * Usage gate configuration — browser-first freemium.
 *
 * Compute happens in the browser (near-zero marginal cost), so the gate is a
 * monetization lever, not a cost lever. Per gated category, an anonymous user
 * gets: 1st use free → 2nd use after a 30s wait → 3rd use behind the paywall.
 * One Pro account unlocks every category, unlimited.
 *
 * Categories not in GATED_LIMITS are always free (calculators, generators,
 * text/dev utilities — no file output, no abuse surface worth metering).
 */

import type { Category } from '@/lib/registry/types';

export const REWARD_WAIT_SECONDS = 30;

/** Free daily uses per gated category. 1 ⇒ free → reward → paywall. */
export const GATED_LIMITS: Partial<Record<Category, number>> = {
  image: 1,
  audio: 1,
  video: 1,
  pdf: 1,
  convert: 1,
  font: 1,
  subtitle: 1,
};

export type GateType = 'free' | 'rewarded' | 'paywall';

export function isGated(category: Category): boolean {
  return category in GATED_LIMITS;
}

export function freeLimitFor(category: Category): number {
  return GATED_LIMITS[category] ?? Infinity;
}

/**
 * Decide the gate for a user at a given usage level. Ported verbatim from the
 * old Redis reward-tracker so behavior is identical.
 *
 * @param currentUsage  uses already counted today for this category
 * @param freeLimit     the category's free daily limit
 * @param rewardClaimed whether the 30s reward was already granted today
 */
export function getGateType(
  currentUsage: number,
  freeLimit: number,
  rewardClaimed: boolean,
): GateType {
  if (!Number.isFinite(freeLimit) || freeLimit >= 9999) return 'free';
  if (freeLimit <= 0) return 'paywall';
  if (currentUsage < freeLimit) return 'free';
  if (currentUsage === freeLimit && !rewardClaimed) return 'rewarded';
  if (currentUsage === freeLimit && rewardClaimed) return 'free';
  return 'paywall';
}
