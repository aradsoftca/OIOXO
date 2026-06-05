/**
 * What the free tier allows and what Pro unlocks, per category — shown in the
 * usage meter on each tool, in the 30s reward gate, and at the paywall. Accurate
 * to the actual gate (config.ts: 1 free/day per gated category → a 30s wait
 * unlocks a 2nd → then Pro). Brand/benefit language only (no tech terms).
 */
import type { Category } from '@/lib/registry/types';
import { isGated, freeLimitFor, freeMaxBytesFor, formatBytes } from './config';

export const PRO_BENEFITS: Partial<Record<Category, string[]>> & { default: string[] } = {
  image:    ['Unlimited image exports — no daily cap', 'No 30-second waits', 'Batch many images at once', 'Full resolution, every format', 'No watermark on your images'],
  audio:    ['Unlimited audio exports', 'No 30-second waits', 'Batch processing', 'Longer files, all formats', 'No brand tag in the filename'],
  video:    ['Unlimited video exports', 'No 30-second waits', 'No “powered by” overlay on your video', 'Bigger files, priority'],
  pdf:      ['Unlimited PDF operations', 'No 30-second waits', 'No “Made with” footer on pages', 'Bigger documents'],
  convert:  ['Unlimited conversions', 'No 30-second waits', 'Bigger files, every format', 'No watermark'],
  font:     ['Unlimited font exports', 'No 30-second waits', 'No watermark'],
  subtitle: ['Unlimited subtitle exports', 'No 30-second waits', 'No watermark'],
  default:  ['Unlimited use — no daily caps', 'No 30-second waits', 'No watermark on your files', 'Batch processing & priority'],
};

export function benefitsFor(category: Category): string[] {
  return PRO_BENEFITS[category] ?? PRO_BENEFITS.default;
}

/** Pro benefits for the P2P-app gate keys (send/call/watch). */
export const APP_BENEFITS: Record<string, string[]> = {
  send:  ['Send files of any size — limited only by your device', 'Unlimited transfers — no daily cap', 'No “Powered by” badge', 'Priority connections'],
  call:  ['Up to 8 people per call (vs 3)', 'Unlimited call length (vs 40 min)', 'Record your calls', 'No “Powered by” badge'],
  watch: ['Up to 50 viewers (vs 3)', '12-hour sessions (vs 30 min)', '1080p streaming', 'No “Powered by” badge'],
};

/** Pro benefits for ANY gate key — category, per-tool studio, or app. */
export function benefitsForKey(key: string): string[] {
  if (key in APP_BENEFITS) return APP_BENEFITS[key];
  return PRO_BENEFITS[key as Category] ?? PRO_BENEFITS.default;
}

/** Human label for the free daily allowance of a gated category. */
export function freeLimitLabel(category: Category): string {
  if (!isGated(category)) return 'Always free — no limits on this tool.';
  const n = freeLimitFor(category);
  if (n >= 9999) return 'Unlimited free use — no daily cap.';
  return `${n} free export${n === 1 ? '' : 's'} per day, then a short wait unlocks one more.`;
}

/** Human label for the free input-size cap (the second gate), or null if uncapped. */
export function freeSizeLabel(category: Category): string | null {
  const cap = freeMaxBytesFor(category);
  if (!Number.isFinite(cap)) return null;
  return `Files up to ${formatBytes(cap)} on free — any size on Pro.`;
}
