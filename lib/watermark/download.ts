'use client';
/**
 * The universal download floor. Every tool that saves a file should route through
 * here so the brand filename suffix is applied consistently — `photo.webp` →
 * `photo-xonvert.webp` for free, `photo.webp` for Pro. This is the minimum
 * watermark for media with no visual surface (audio/data/text), and a backstop for
 * everything else (the richer visible/metadata marks are applied at the source —
 * image/audio in the encrypted worker, pdf footer, etc.).
 *
 * It triggers a normal `<a download>` click so the existing usage gate still sees
 * it (we do NOT bypass metering here — this only renames + saves).
 */
import { WM_SLUG, WM_DOMAIN, watermarkOnSync } from './config';
import { isWatermarkOn } from './config';

/**
 * Stamp the brand domain as a small footer on every page of a jsPDF document for
 * FREE sessions. Used by surfaces that build PDFs with jsPDF directly and so
 * bypass the pdf-engine footer (htmlToPdf, Slides/QR studios, doc conversions).
 * Pro → no-op. Never throws.
 */
export function brandJsPdf(pdf: any): void {
  if (!watermarkOnSync()) return;
  try {
    // 1. Document properties — survive any re-save/print/cut-and-paste cycle.
    //    Visible in Acrobat → File → Properties.
    if (typeof pdf.setProperties === 'function') {
      try {
        pdf.setProperties({
          creator: WM_DOMAIN,
          author: WM_DOMAIN,
          producer: WM_DOMAIN,
          subject: `Made with ${WM_DOMAIN}`,
          keywords: `${WM_DOMAIN}, made-with-${WM_DOMAIN}`,
        });
      } catch { /* old jsPDF lacks setProperties → fall through */ }
    }
    // 2. Footer text on every page.
    const n: number = (typeof pdf.getNumberOfPages === 'function' && pdf.getNumberOfPages()) || pdf.internal?.getNumberOfPages?.() || 1;
    const prev = typeof pdf.getFontSize === 'function' ? pdf.getFontSize() : 12;
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      const w: number = pdf.internal.pageSize.getWidth();
      const h: number = pdf.internal.pageSize.getHeight();
      const m = Math.max(8, h * 0.025);
      pdf.setFontSize(9); pdf.setTextColor(150, 150, 150);
      pdf.text(WM_DOMAIN, m, h - m);
    }
    pdf.setFontSize(prev); pdf.setTextColor(0, 0, 0);
  } catch { /* never break an export */ }
}

/**
 * Inject a brand-domain <text> mark (bottom-right) into an SVG string for FREE
 * sessions. Vector exports (charts, diagrams) never touch the canvas patch, so
 * this is their visual mark. Pro → returns the SVG unchanged.
 */
export function brandSvg(svg: string): string {
  if (!watermarkOnSync()) return svg;
  try {
    let w = 0, h = 0;
    const vb = /viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i.exec(svg);
    if (vb) { w = +vb[1]; h = +vb[2]; }
    else { const wm = /\bwidth=["']?([\d.]+)/i.exec(svg), hm = /\bheight=["']?([\d.]+)/i.exec(svg); if (wm) w = +wm[1]; if (hm) h = +hm[1]; }
    if (!w || !h) return svg;
    const fs = Math.max(9, w * 0.022);
    const mark = `<text x="${(w - w * 0.02).toFixed(1)}" y="${(h - h * 0.02).toFixed(1)}" text-anchor="end" font-family="system-ui,-apple-system,sans-serif" font-size="${fs.toFixed(1)}" fill="#888888" fill-opacity="0.7">${WM_DOMAIN}</text>`;
    return /<\/svg>/i.test(svg) ? svg.replace(/<\/svg>\s*$/i, `${mark}</svg>`) : svg;
  } catch { return svg; }
}

/** Append the brand slug before the extension when watermarking is on. */
export function brandFilename(base: string, ext: string, watermark: boolean): string {
  const stem = base.replace(/\.[^./\\]+$/, '') || 'download';
  const e = ext.replace(/^\./, '');
  return watermark ? `${stem}-${WM_SLUG}.${e}` : `${stem}.${e}`;
}

/** Brand a full filename (e.g. "photo.webp" → "photo-xonvert.webp") iff this is a
 *  free session. Used by the global download interceptor to cover every tool that
 *  builds its own `<a download>` without routing through downloadBlob(). */
export async function brandedName(name: string): Promise<string> {
  return brandedNameWith(name, await isWatermarkOn());
}

/** Synchronous variant (cached watermark state) for the capture-phase download
 *  interceptor, which must rename `a.download` before the browser acts. */
export function brandedNameSync(name: string): string {
  return brandedNameWith(name, watermarkOnSync());
}

function brandedNameWith(name: string, watermark: boolean): string {
  if (!watermark) return name;
  if (/-(xonvert|oioxo)\.[^./\\]+$/i.test(name)) return name; // already branded — don't double-suffix
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : 'bin';
  return brandFilename(base, ext, true);
}

/**
 * Save a blob with the brand-aware filename. `base` is the desired name (with or
 * without extension); `ext` is the output extension. Returns the final filename.
 */
export async function downloadBlob(blob: Blob, base: string, ext: string): Promise<string> {
  const name = brandFilename(base, ext, await isWatermarkOn());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 60s defer matches the engines/* helpers. 4s was occasionally too short
  // on slow mobile networks where the download dialog only opens a few
  // seconds after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}
