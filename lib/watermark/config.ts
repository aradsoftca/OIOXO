/**
 * Brand watermark — central config + the free/Pro switch.
 *
 * Free tier signs every artifact that leaves the app (image stamp, audio/pdf
 * metadata, "powered by" on live sessions, and a `-xonvert` filename on every
 * download); Pro/Team removes all of it. Brand-aware (xonvert ↔ oioxo). Per the
 * secret-tech rule, copy is brand/domain ONLY — never technology names.
 *
 * The "on" check reuses the same entitlement the tool lock uses, so watermark
 * state and Pro state are always consistent. It defaults to ON (watermark) on any
 * error — a free-safe default; a Pro user with a transient outage briefly gets a
 * filename suffix, never a broken download.
 */
import { BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { getEntitlement, isPro } from '@/lib/oioxo/entitlement-client';
import { getPolicy } from '@/lib/limits/policy';

/** Short slug appended to filenames, e.g. `photo-xonvert.webp`. */
export const WM_SLUG = IS_OIOXO ? 'oioxo' : 'xonvert';
/** Visible/embedded attribution text. */
export const WM_MADE_WITH = `Made with ${BRAND_DOMAIN}`;
/** Live-session badge text. */
export const WM_POWERED_BY = `Powered by ${BRAND_DOMAIN}`;
/** Just the domain — used for the compact corner image stamp. */
export const WM_DOMAIN = BRAND_DOMAIN;
/** Square brand mark served from /public (used by the image/video stamp). */
export const WM_LOGO = IS_OIOXO ? '/oioxo-icon.png' : '/icon.png';

/** Cached watermark state for SYNCHRONOUS callers (the download interceptor renames
 *  filenames in a capture-phase click handler and can't await). Default ON
 *  (free-safe); updated whenever isWatermarkOn() resolves. */
let _wmSync = true;
export function watermarkOnSync(): boolean { return _wmSync; }

/** True when the current session should be watermarked (i.e. NOT Pro/Team). */
export async function isWatermarkOn(): Promise<boolean> {
  try {
    const e = await getEntitlement();
    _wmSync = !isPro(e);
    return _wmSync;
  } catch {
    return _wmSync; // keep last-known (defaults to ON)
  }
}

/** Sync check including a tool's policy opt-out. Tools whose policy declares
 *  `watermarkFree: false` (e.g. raw format conversions, dev/encrypt utilities)
 *  never stamp — they're function-as-utility, not assets, and watermarking
 *  audio/data would damage the output. Pro is always off; free defers to the
 *  policy flag (default ON when the tool has no policy). */
export function shouldWatermark(toolKey?: string): boolean {
  if (!watermarkOnSync()) return false;
  if (!toolKey) return true;
  const policy = getPolicy(toolKey);
  if (!policy) return true;
  return policy.watermarkFree;
}
