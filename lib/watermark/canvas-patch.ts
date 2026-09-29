'use client';
/**
 * Universal canvas watermark. ~40 image tools export straight from a <canvas> via
 * toBlob()/toDataURL() and never touch the engine encode() chokepoint, so they'd
 * ship UNbranded. Rather than edit every tool (and miss some), we patch the two
 * canvas export methods once: each call stamps a COPY of the canvas (the original
 * is never mutated, so previews/processing/subsequent draws are unaffected) and
 * returns the branded output.
 *
 * Default ON (free-safe); Pro/Team calls setCanvasWatermarkEnabled(false). Skips
 * small canvases (icons/thumbnails) where a label would just deface them. Reuses
 * old xonvert's design: domain, bottom-right, white, scaled, soft shadow.
 *
 * Hardened against tampering: the prototype patches are installed with
 * `configurable: false` and `writable: false`, so a clone or hostile script
 * CANNOT `delete HTMLCanvasElement.prototype.toBlob` to restore the original.
 * Attempting to reassign throws in strict mode — and since the prototype is
 * already polluted before any user JS runs (mounted in UsageGateProvider that
 * wraps the root layout), the descriptor lock is the last write.
 */
import { WM_DOMAIN } from './config';
import { brandedNameSync } from './download';
import { shouldWatermark } from './config';
import { TOOLS } from '@/lib/registry';

let enabled = true;
let installed = false;
let anchorInstalled = false;

export function setCanvasWatermarkEnabled(on: boolean): void { enabled = on; }

/** Map a pathname like "/tools/video-convert-format" → "video-convert-format"
 *  so the canvas patch can ask shouldWatermark(toolKey) for per-tool opt-out. */
function toolKeyForCurrentRoute(): string | undefined {
  if (typeof location === 'undefined') return undefined;
  const m = /^\/tools\/([^/?#]+)/.exec(location.pathname);
  if (m) return m[1];
  // Convert pair page → use the underlying tool id from the registry.
  const c = /^\/convert\/([^/?#]+)/.exec(location.pathname);
  if (c) {
    const slug = c[1];
    // Try to find the tool that owns this conversion. The convert pair routes
    // aren't in TOOLS, but their target tool ids are common (image-convert-format
    // etc.); fall back to undefined and let the patch use the global rule.
    return TOOLS.find((t) => slug.includes(t.id))?.id;
  }
  return undefined;
}

/**
 * Patch HTMLAnchorElement.click so a programmatic `<a download>` is brand-renamed
 * even when the anchor is never appended to the DOM (those bypass the capture-phase
 * download interceptor). Free → `photo.png` → `photo-xonvert.png`; Pro → unchanged.
 * Installed with a NON-CONFIGURABLE descriptor so `delete proto.click` fails. */
export function installAnchorBrand(): void {
  if (anchorInstalled || typeof HTMLAnchorElement === 'undefined') return;
  anchorInstalled = true;
  const proto = HTMLAnchorElement.prototype;
  const orig = proto.click;
  const patched = function (this: HTMLAnchorElement) {
    try {
      if (this.download) {
        // Filename branding applies to every free download, including clean-intent
        // tools (watermarkFree:false only turns off the in-file stamp).
        this.download = brandedNameSync(this.download);
      }
    } catch { /* never break a download */ }
    return orig.call(this);
  };
  try {
    Object.defineProperty(proto, 'click', {
      value: patched,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch {
    // Fallback to plain assignment (older runtimes); still strictly better
    // than leaving the original.
    proto.click = patched;
  }
}

/** Longest edge below this = favicon/thumbnail/sprite → don't stamp. */
const MIN_EDGE = 200;

/** Tools whose output must stay clean: QR/barcode (a corner mark breaks scanning),
 *  favicons/icons (too small / would be defaced). Matched on the route. */
const SKIP_ROUTE = /qr-code|studio-qr|scan-qr|barcode|favicon|\/icon|app-icon/;

function stampedCopy(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height;
  // Opt-out: disabled (Pro), data-nowm canvas, too small, scannable/icon tool,
  // OR the tool's policy declares watermarkFree:false (raw converters where a
  // stamp damages the output — they get filename-only branding).
  const toolKey = toolKeyForCurrentRoute();
  if (
    !enabled ||
    (canvas.dataset && canvas.dataset.nowm === '1') ||
    Math.max(w, h) < MIN_EDGE ||
    (typeof location !== 'undefined' && SKIP_ROUTE.test(location.pathname)) ||
    !shouldWatermark(toolKey)
  ) return canvas;
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return canvas;
    ctx.drawImage(canvas, 0, 0);
    const fontPx = Math.max(12, Math.round(w * 0.026));
    const pad = Math.round(w * 0.02);
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 0.55;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.18));
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(WM_DOMAIN, w - pad, h - pad);
    return c;
  } catch {
    return canvas; // never break an export
  }
}

/** Patch the prototype once. Safe to call repeatedly. The patched methods are
 *  installed with NON-CONFIGURABLE descriptors so a clone can't
 *  `delete HTMLCanvasElement.prototype.toBlob` to restore the original. */
export function installCanvasWatermark(): void {
  if (installed || typeof HTMLCanvasElement === 'undefined') return;
  installed = true;
  const proto = HTMLCanvasElement.prototype;

  const origToBlob = proto.toBlob;
  const patchedToBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: number) {
    origToBlob.call(stampedCopy(this), cb, type as never, quality as never);
  };
  const origToDataURL = proto.toDataURL;
  const patchedToDataURL = function (this: HTMLCanvasElement, type?: string, quality?: number) {
    return origToDataURL.call(stampedCopy(this), type as never, quality as never);
  };

  try {
    Object.defineProperty(proto, 'toBlob', {
      value: patchedToBlob, writable: false, configurable: false, enumerable: false,
    });
    Object.defineProperty(proto, 'toDataURL', {
      value: patchedToDataURL, writable: false, configurable: false, enumerable: false,
    });
  } catch {
    // Fallback for older runtimes — still strictly better than leaving the
    // original methods.
    proto.toBlob = patchedToBlob;
    proto.toDataURL = patchedToDataURL;
  }
}
