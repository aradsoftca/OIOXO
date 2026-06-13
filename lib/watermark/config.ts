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

/** Authoritative override for environments that own their Pro state outside the
 *  web `/api/entitlement` flow (the native xtudio apps read it from a signed,
 *  device-bound entitlement). When set, it wins over the async fetch — so a Pro
 *  app user is never watermarked and a free one always is, without depending on
 *  the cookie-based web entitlement that doesn't exist in the WebView. `null`
 *  (the web default) leaves the original fetch-driven behavior untouched. */
let _wmOverride: boolean | null = null;
export function setWatermarkOverride(on: boolean | null): void {
  _wmOverride = on;
  if (on !== null) _wmSync = on;
}

export function watermarkOnSync(): boolean {
  return _wmOverride !== null ? _wmOverride : _wmSync;
}

/** True when the current session should be watermarked (i.e. NOT Pro/Team). */
export async function isWatermarkOn(): Promise<boolean> {
  if (_wmOverride !== null) return _wmOverride;
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

/* ─────────────────────── ambient current-tool key ─────────────────────────
 * Engines (audio/image/ffmpeg) encode deep in the call stack and can't easily
 * receive the calling tool's id through 17+ call sites. The gate provider sets
 * the active tool key on every route change (sync, from the path), and the
 * engines consult `shouldWatermarkHere()` so a clean-intent tool's embedded
 * brand (ID3/RIFF metadata, etc.) is suppressed — matching the filename and
 * canvas behavior. Defaults to "brand" (free-safe) when no tool is active.
 * ───────────────────────────────────────────────────────────────────────── */
let _currentToolKey: string | undefined;
let _currentToolCategory: string | undefined;
/** Set the active tool (id + category) so engines can resolve watermarkFree.
 *  Category is the fallback for tools with no per-tool policy (e.g. the ~20 basic
 *  audio DSP tools, which inherit the `audio` category's watermarkFree:false). */
export function setCurrentToolKey(key: string | undefined, category?: string): void {
  _currentToolKey = key;
  _currentToolCategory = category;
}
export function currentToolKey(): string | undefined { return _currentToolKey; }

/** True when the engine should embed the brand for the CURRENTLY-ACTIVE tool —
 *  free session AND neither the tool's policy NOR its category policy declares
 *  watermarkFree:false. */
export function shouldWatermarkHere(): boolean {
  if (!watermarkOnSync()) return false;
  // Per-tool policy wins; else fall back to the category policy; else brand.
  if (_currentToolKey && getPolicy(_currentToolKey)) return shouldWatermark(_currentToolKey);
  if (_currentToolCategory && getPolicy(_currentToolCategory)) return shouldWatermark(_currentToolCategory);
  return true;
}
