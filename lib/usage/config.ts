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
/** Uses one finished rewarded ad (mobile app, AdMob) gives back — see lib/usage/ad-reward.ts. */
export const AD_REWARD_USES = 3;

/**
 * Free daily uses per gated CATEGORY. N ⇒ N free → 30s reward earns +1 → paywall.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THE COUNT LEVER. The richer
 * lib/limits/policy.ts owns every QUALITATIVE lever (resolution, bitrate, fps,
 * pages, tracks, layers, batch, participants, session-minutes, ai-minutes,
 * formats, history) and the per-tool `watermarkFree` flag — but its `count-day`
 * lever is NEVER read at runtime (no call site). So every per-tool/studio daily
 * count MUST live here (category default below, per-tool override in
 * GATED_TOOL_LIMITS) or it does not exist.
 *
 * Commercial stance (revenue-max, rival-benchmarked): on-device compute is ~$0
 * marginal cost, so we out-generous every cloud rival on the axes that cost us
 * nothing (task frequency on commodities, file size, batch) and convert ONLY on
 * real value (a true watermark on free creative/AI output, premium formats, AI
 * accuracy/stems/dub, security). Category defaults below are deliberately WIDE so
 * a casual user almost never hits a wall; the real Pro hook is the watermark +
 * premium formats + per-tool AI caps, not artificial count scarcity. Heavy/value
 * tools tighten their own count via GATED_TOOL_LIMITS.
 */
export const GATED_LIMITS: Partial<Record<Category, number>> = {
  image: 10,   // image EDITS (resize/compress/filters) — was 2; commodity-generous, watermark is the hook
  audio: 10,   // basic audio ops are clean commodities — was 2; the Pro wall is 320k/FLAC/batch, not count
  video: 3,    // video is heavier; per-tool overrides (trim=5, gif=3, auto-dub=1) refine this — was 2
  pdf: 10,     // PDF commodity ops cost us nothing; beats Smallpdf 2/day, Adobe 1/30d — was 2
  convert: 9999, // universal converter = the structural moat vs cloud converters: NO daily limit — was 2
  font: 9999,  // pure utility, no paid market — unlimited funnel — was 2
  subtitle: 2, // AI transcription has a real per-day minute cost (policy ai-minutes) — keep tight
  social: 3,   // social graphics are real assets; watermark is the hook — was 2
};

/**
 * Per-TOOL gate overrides — the meter key is the tool id, metered independently
 * from its category. TWO uses:
 *   1. Tools whose CATEGORY is ungated (QR/color/text utilities stay free) but
 *      whose OUTPUT is premium (the value studios).
 *   2. The designed per-tool count tiers ported from policy.ts so they ACTUALLY
 *      fire (the policy.ts numbers were dead code). A tool id here also makes the
 *      global download interceptor charge THIS key instead of the flat category.
 * For tools that are pure commodities we set 9999 (= effectively unlimited; the
 * gate treats >=9999 as 'free' — see getGateType).
 */
export const GATED_TOOL_LIMITS: Record<string, number> = {
  // value studios (category ungated; output premium)
  'studio-invoice': 2,
  'studio-resume': 2,
  'studio-chart': 4,
  'studio-diagram': 4,
  // office studios — were COMPLETELY UNGATED (revenue leak); now real daily caps
  'office-studio': 3,
  'office-docs': 3,
  'office-slides': 3,
  // studio twins of the office/value tools — same leak, missed in the first pass
  // (categories convert/text/generator are ungated, so these shipped free-unlimited)
  'translate-studio': 5,   // on-device OCR + translate + export — the critical leak
  'text-translate': 10,    // on-device translation model; commodity-ish but metered
  'studio-docs': 3,
  'studio-slides': 3,
  'studio-sheets': 4,
  'studio-background': 2,  // heavy on-device bg-removal model
  'image-passport': 2,     // intended 2/day (was leaking at category image=10)
  // image: commodity converters = unlimited funnel; AI/heavy = tight value caps
  'image-convert-format': 9999,
  'image-heic-convert': 9999,
  'image-batch-compress': 9999,
  'image-remove-bg': 3,
  'image-ocr': 10,
  'image-batch-resize': 5,
  'image-batch-convert': 5,
  'image-doc-scan': 5,
  'image-upscale': 2,
  'image-enhance': 2,
  'image-object-remove': 2,
  'image-smart-cutout': 2,
  // video: viral cheap ops generous, expensive AI ops protected
  'video-trim': 5,
  'video-to-gif': 3,
  'video-auto-dub': 1,      // single most compute-heavy on-device op — was being DOUBLED to 2
  'video-compress': 4,
  'video-convert-format': 3,
  // audio: AI transcribe/stems metered; convert is the clean commodity (count via category=10)
  'audio-to-text': 2,
  'audio-vocal-remover': 2,
  // pdf: OCR is a free commodity to win the comparison; heavy stays in category=10
  'pdf-ocr': 10,
};

/** For a per-tool gate key, the category whose color/name/benefits the modal shows. */
export const GATED_TOOL_DISPLAY: Record<string, Category> = {
  'studio-invoice': 'pdf',
  'studio-resume': 'pdf',
  'studio-chart': 'image',
  'studio-diagram': 'image',
  'office-studio': 'convert',
  'office-docs': 'text',
  'office-slides': 'image',
  'translate-studio': 'text',
  'text-translate': 'text',
  'studio-docs': 'text',
  'studio-slides': 'image',
  'studio-sheets': 'convert',
  'studio-background': 'image',
  'image-passport': 'image',
  'image-convert-format': 'image',
  'image-heic-convert': 'image',
  'image-batch-compress': 'image',
  'image-remove-bg': 'image',
  'image-ocr': 'image',
  'image-batch-resize': 'image',
  'image-batch-convert': 'image',
  'image-doc-scan': 'image',
  'image-upscale': 'image',
  'image-enhance': 'image',
  'image-object-remove': 'image',
  'image-smart-cutout': 'image',
  'video-trim': 'video',
  'video-to-gif': 'video',
  'video-auto-dub': 'video',
  'video-compress': 'video',
  'video-convert-format': 'video',
  'audio-to-text': 'audio',
  'audio-vocal-remover': 'audio',
  'pdf-ocr': 'pdf',
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
  send: 5,   // file transfers started / day — viral, generous; Pro = unlimited
  call:  3,  // calls hosted / day — a hosted call is a high-intent moment; 3 free beats Zoom's 40-min/meeting friction while pushing power hosts to Pro (was 5; corrected to the intended value)
  watch: 3,  // screen-share sessions hosted / day — same rationale as call (was 5)
};

export const APP_MAX_BYTES: Record<string, number> = {
  send: 2 * 1024 * 1024 * 1024, // 2 GB per free transfer (Pro = device-limited, not a fixed 20GB)
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
  image: 25 * MB,   // was 10 — phone photos run 8-15MB; 10 bounced the try-it-once moment. Aligns with policy.ts image-studio 25MB so the two systems agree.
  pdf: 100 * MB,    // was 20 — local processing has no server cost; PDFescape caps 10MB, we shouldn't
  audio: 100 * MB,  // was 30 — a real song/podcast is 30-80MB
  video: 150 * MB,  // was 50 — a phone clip is 100-300MB; 50 repelled before first success
  convert: 500 * MB, // was 25 — the converter is the moat vs CloudConvert (1GB); be huge
  font: 25 * MB,    // was 10
  subtitle: 25 * MB, // was 5
  social: 25 * MB,  // was 15
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
