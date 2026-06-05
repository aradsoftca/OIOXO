/**
 * Brand image watermark — drawn INSIDE the encrypted image/codec worker, so a free
 * user can't strip it with a client-side toggle (the stamping code only exists in
 * the AES-encrypted worker bundle). Ported from old xonvert's design: the domain
 * in the bottom-right corner, white, scaled to the image, semi-transparent — plus
 * a soft shadow so it stays legible on light backgrounds.
 *
 * Worker-safe: uses OffscreenCanvas only, no DOM, no entitlement imports.
 */

/** Smallest edge we bother stamping — below this it's an icon/favicon, not a
 *  shareable artifact, and a label would just deface it. */
const MIN_W = 160;
const MIN_H = 64;

/**
 * Return a copy of `img` with the brand domain stamped bottom-right. If the image
 * is too small the original is returned untouched.
 */
export function stampImageData(img: ImageData, text: string, opacity = 0.55): ImageData {
  const { width, height } = img;
  if (width < MIN_W || height < MIN_H || !text) return img;
  // A watermark failure must NEVER break the export — fall back to the original.
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;
    ctx.putImageData(img, 0, 0);

    const fontPx = Math.max(11, Math.round(width * 0.026));
    const pad = Math.round(width * 0.02);
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = opacity;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.18));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, width - pad, height - pad);

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    return ctx.getImageData(0, 0, width, height);
  } catch {
    return img;
  }
}
