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
import { CATEGORIES } from '@/lib/registry/types';

export const REWARD_WAIT_SECONDS = 30;

/**
 * Free daily uses per gated CATEGORY. N ⇒ N free → 30s reward earns +1 → paywall.
 *
 * Tuned "a little wider" than the original 1/day so a casual user rarely hits a
 * wall in one sitting, while a heavy user still converts. `social` is gated here
 * because every social tool (avatars, banners, OG images, memes, thumbnails)
 * outputs a real downloadable graphic — the same value as an image export.
 */
export const GATED_LIMITS: Partial<Record<Category, number>> = {
  image: 2,
  audio: 2,
  video: 2,
  pdf: 2,
  convert: 2,
  font: 2,
  subtitle: 2,
  social: 2,
};

/**
 * Per-TOOL gate overrides — for tools whose CATEGORY is ungated (so QR, color,
 * password, plain text utilities stay free) but whose OUTPUT is premium: the
 * value studios. Keyed by tool id; the id itself becomes the meter key, metered
 * independently from any category. Surgical by design.
 */
export const GATED_TOOL_LIMITS: Record<string, number> = {
  'studio-invoice': 2,
  'studio-resume': 2,
  'studio-chart': 4,
  'studio-diagram': 4,
};

/** For a per-tool gate key, the category whose color/name/benefits the modal shows. */
export const GATED_TOOL_DISPLAY: Record<string, Category> = {
  'studio-invoice': 'pdf',
  'studio-resume': 'pdf',
  'studio-chart': 'image',
  'studio-diagram': 'image',
};

/**
 * Tools that must NEVER be gated even if their category is — scannable output
 * (QR/barcode would break with a corner mark) or trivially-small icons. Mirrors
 * the watermark SKIP_ROUTE so policy stays consistent across the two systems.
 */
export const FREE_TOOL_IDS = new Set<string>([
  'qr-code', 'studio-qr', 'scan-qr', 'barcode', 'favicon-generator',
]);

/* ────────────────────────────── P2P apps ──────────────────────────────────
 * The live apps are viral growth engines, so the CORE stays free (with the
 * "Powered by" badge) — we gate only two levers, both pre-action so a live
 * session/transfer is never interrupted mid-stream:
 *   • SIZE  — a free transfer up to APP_MAX_BYTES (no server cost; pure lever).
 *   • COUNT — APP_LIMITS sessions/transfers per UTC day, set "a little wider"
 *             than the tool gate since sharing should feel generous.
 * Over either → upgrade prompt. Pro = unlimited + no badge + recording etc.
 * Chat / Whiteboard / Clipboard / Note stay fully free (badge only).
 * ───────────────────────────────────────────────────────────────────────── */
export const APP_LIMITS: Record<string, number> = {
  send: 5,   // file transfers started / day
  call:  5,  // calls hosted / day
  watch: 5,  // screen-share sessions hosted / day
};

export const APP_MAX_BYTES: Record<string, number> = {
  send: 2 * 1024 * 1024 * 1024, // 2 GB per free transfer
};

/** Modal label + color for a non-category gate key (apps). */
export const APP_META: Record<string, { name: string; colorVar: string }> = {
  send:  { name: 'Send',  colorVar: '--color-cat-convert' },
  call:  { name: 'Call',  colorVar: '--color-cat-video' },
  watch: { name: 'Watch', colorVar: '--color-cat-video' },
};

const MB = 1024 * 1024;

/**
 * The SECOND free-tier gate: maximum input file size, per category.
 *
 * Old xonvert gated on two axes — daily count AND file size — so a free user
 * could try a tool but real, heavy files pushed them to Pro. We keep that, but
 * the numbers are looser here because compute is browser-side (no server cost):
 * the size cap is purely a monetization lever, set so a quick try fits free
 * while serious work upgrades. Pro has NO size cap (browser-memory bound only).
 *
 * A file over the cap shows a polite upgrade gate (no 30s reward — you can't earn
 * a bigger file by waiting), exactly like old xonvert's "File too large" path.
 * Tune freely — this map is the single source of truth, surfaced in the meter,
 * the converter, the /limits page and the gate modal.
 */
export const FREE_MAX_BYTES: Partial<Record<Category, number>> = {
  image: 10 * MB,
  pdf: 20 * MB,
  audio: 30 * MB,
  video: 50 * MB,
  convert: 25 * MB,
  font: 10 * MB,
  subtitle: 5 * MB,
  social: 15 * MB,
};

/** Free input-size cap for a category (Infinity when uncapped / Pro). */
export function freeMaxBytesFor(category: Category): number {
  return FREE_MAX_BYTES[category] ?? Infinity;
}

/** Human file-size, e.g. 10 MB / 512 KB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'unlimited';
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
}

/**
 * OIOXO online IDE — the AI coding agent is metered by TIME, not per-action.
 * Every model is accessible (gated only by hardware); free accounts get a daily
 * allowance of active AI seconds, after which they must activate (pay) the account.
 * Activated (PRO/BUSINESS/lifetime) accounts are unlimited.
 */
export const CODE_FREE_SECONDS_PER_DAY = 60 * 60; // 1 hour of active AI / UTC day, free
export const CODE_CATEGORY = 'code';

export type GateType = 'free' | 'rewarded' | 'paywall';

export function isGated(category: Category): boolean {
  return category in GATED_LIMITS;
}

export function freeLimitFor(category: Category): number {
  return GATED_LIMITS[category] ?? Infinity;
}

/* ────────────────────────── key-based gate layer ──────────────────────────
 * The meter (service.ts / /api/usage) stores counts by an arbitrary string
 * "gate key". Normally the key is the Category, but for the surgical per-tool
 * cases (value studios in an otherwise-free category) the key is the tool id.
 * These helpers resolve a (toolId, category) pair to a single gate key and the
 * limits/display that key carries. Server and client both go through them so
 * the policy lives in exactly one place.
 * ───────────────────────────────────────────────────────────────────────── */

/** The meter key to charge for a tool, or null if the tool is never gated. */
export function gateKeyForTool(toolId: string | undefined, category: Category): string | null {
  if (toolId && FREE_TOOL_IDS.has(toolId)) return null;
  if (toolId && toolId in GATED_TOOL_LIMITS) return toolId;
  if (category in GATED_LIMITS) return category;
  return null;
}

/** Whether a meter key is gated at all (category, per-tool, OR app). */
export function isGatedKey(key: string): boolean {
  return key in GATED_TOOL_LIMITS || key in GATED_LIMITS || key in APP_LIMITS;
}

/** Free daily allowance for a meter key (per-tool/app override wins over category). */
export function limitForKey(key: string): number {
  if (key in GATED_TOOL_LIMITS) return GATED_TOOL_LIMITS[key];
  if (key in APP_LIMITS) return APP_LIMITS[key];
  return (GATED_LIMITS as Record<string, number>)[key] ?? Infinity;
}

/** Free input-size cap for a meter key (count-only keys → uncapped). */
export function maxBytesForKey(key: string): number {
  if (key in APP_MAX_BYTES) return APP_MAX_BYTES[key];
  return (FREE_MAX_BYTES as Record<string, number>)[key] ?? Infinity;
}

/** The category whose color/name/benefits the gate modal renders for a key. */
export function displayCategoryForKey(key: string): Category {
  if (key in GATED_TOOL_DISPLAY) return GATED_TOOL_DISPLAY[key];
  return key as Category;
}

/** Modal display meta (name + color) for ANY gate key — category, per-tool, or app. */
export function gateMetaForKey(key: string): { name: string; colorVar: string } {
  if (key in APP_META) return APP_META[key];
  const cat = CATEGORIES[displayCategoryForKey(key)];
  return cat ? { name: cat.name, colorVar: cat.colorVar } : { name: 'Pro', colorVar: '--color-cat-convert' };
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
