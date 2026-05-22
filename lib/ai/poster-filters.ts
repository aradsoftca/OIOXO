/**
 * Poster filter library — canvas photo treatments the composer mixes onto a
 * stock-photo background. Pure canvas ops (overlay blends + pixel maths), so
 * they run on-device and need no extra download. The AI picks a filter as part
 * of the layout spec; "blur" is handled at draw time, the rest post-process.
 */

export type FilterKey =
  | 'none' | 'darken' | 'duotone' | 'noir' | 'cinematic' | 'tint' | 'fade' | 'vibrant' | 'blur';

export const FILTERS: FilterKey[] = ['none', 'darken', 'duotone', 'noir', 'cinematic', 'tint', 'fade', 'vibrant', 'blur'];

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function overlay(ctx: CanvasRenderingContext2D, w: number, h: number, fill: string, op: GlobalCompositeOperation = 'source-over') {
  ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h); ctx.restore();
}

/**
 * Apply a filter to the photo already drawn at (0,0,w,h). `accent` and `deep`
 * are palette colours used by the tinting filters. Pixel ops are wrapped so a
 * (cross-origin) tainted canvas degrades gracefully instead of throwing.
 */
export function applyFilter(ctx: CanvasRenderingContext2D, w: number, h: number, filter: FilterKey, accent: string, deep: string) {
  switch (filter) {
    case 'darken':
      overlay(ctx, w, h, 'rgba(0,0,0,0.38)');
      return;
    case 'tint':
      overlay(ctx, w, h, `rgba(${rgb(accent).join(',')},0.40)`, 'overlay');
      overlay(ctx, w, h, 'rgba(0,0,0,0.22)');
      return;
    case 'blur':
      return; // handled when the photo is drawn (ctx.filter)
    case 'none':
      return;
    default:
      break;
  }
  // pixel-level filters
  let img: ImageData;
  try { img = ctx.getImageData(0, 0, w, h); } catch { overlay(ctx, w, h, 'rgba(0,0,0,0.3)'); return; }
  const d = img.data;
  const [ar, ag, ab] = rgb(accent);
  const [dr, dg, db] = rgb(deep);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    switch (filter) {
      case 'duotone': {
        d[i] = dr + (ar - dr) * lum; d[i + 1] = dg + (ag - dg) * lum; d[i + 2] = db + (ab - db) * lum;
        break;
      }
      case 'noir': {
        const c = Math.min(255, Math.max(0, (lum - 0.5) * 1.5 * 255 + 128));
        d[i] = d[i + 1] = d[i + 2] = c;
        break;
      }
      case 'cinematic': {
        // teal shadows, warm highlights
        d[i] = Math.min(255, r + (lum > 0.5 ? 22 : -10));
        d[i + 1] = Math.min(255, g + (lum > 0.5 ? 8 : 4));
        d[i + 2] = Math.min(255, b + (lum > 0.5 ? -12 : 24));
        break;
      }
      case 'fade': {
        d[i] = r * 0.85 + 30; d[i + 1] = g * 0.85 + 28; d[i + 2] = b * 0.85 + 34;
        break;
      }
      case 'vibrant': {
        const avg = (r + g + b) / 3;
        d[i] = Math.min(255, Math.max(0, avg + (r - avg) * 1.4));
        d[i + 1] = Math.min(255, Math.max(0, avg + (g - avg) * 1.4));
        d[i + 2] = Math.min(255, Math.max(0, avg + (b - avg) * 1.4));
        break;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // a touch of darkening on the busy filters so text stays legible
  if (filter === 'cinematic' || filter === 'vibrant' || filter === 'duotone') overlay(ctx, w, h, 'rgba(0,0,0,0.18)');
}
