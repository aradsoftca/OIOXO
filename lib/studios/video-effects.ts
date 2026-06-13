// Shared video-effects library for the Video Studio. ONE source of truth so the
// live preview (drawVideoFrame) and the export compositor (drawClipFrame) apply
// IDENTICAL per-clip effects. Effects are stackable and split into two kinds:
//   • CSS-filter effects (cheap, GPU): appended to the ctx.filter string.
//   • Pixel effects (vignette/grain/pixelate/mirror): applied as a post pass on
//     the drawn region's ImageData.
// Rival bar: CapCut/Premiere ship large effect libraries — this gives a real,
// stackable rack covering the common creative vocabulary.

export type VideoEffectType =
  | 'blur' | 'sharpen' | 'glow' | 'vignette' | 'grain' | 'pixelate'
  | 'mirror' | 'grayscale' | 'sepia' | 'invert' | 'posterize' | 'chromatic';

export interface VideoEffect {
  type: VideoEffectType;
  enabled: boolean;
  /** 0..100 generic intensity; meaning depends on the effect. */
  amount: number;
}

export const VIDEO_EFFECT_LABELS: Record<VideoEffectType, string> = {
  blur: 'Blur', sharpen: 'Sharpen', glow: 'Glow', vignette: 'Vignette',
  grain: 'Film grain', pixelate: 'Pixelate', mirror: 'Mirror',
  grayscale: 'B&W', sepia: 'Sepia', invert: 'Invert', posterize: 'Posterize',
  chromatic: 'Chromatic',
};

export const VIDEO_EFFECT_DEFAULT_AMOUNT: Record<VideoEffectType, number> = {
  blur: 30, sharpen: 40, glow: 40, vignette: 50, grain: 30, pixelate: 30,
  mirror: 100, grayscale: 100, sepia: 100, invert: 100, posterize: 50, chromatic: 30,
};

/** CSS-filter fragment for the filter-based effects (composes with the clip's
 *  brightness/contrast/etc. filter string). Returns '' for pixel-only effects. */
export function effectFilterFragment(effects: VideoEffect[] | undefined, refPx: number): string {
  if (!effects) return '';
  const u = refPx / 1920;
  const parts: string[] = [];
  for (const e of effects) {
    if (!e.enabled) continue;
    const a = e.amount / 100;
    switch (e.type) {
      case 'blur': parts.push(`blur(${(e.amount * 0.12 * u).toFixed(2)}px)`); break;
      case 'glow': parts.push(`brightness(${1 + a * 0.25}) contrast(${1 + a * 0.15}) drop-shadow(0 0 ${(e.amount * 0.3 * u).toFixed(1)}px rgba(255,255,255,${(a * 0.6).toFixed(2)}))`); break;
      case 'grayscale': parts.push(`grayscale(${a})`); break;
      case 'sepia': parts.push(`sepia(${a})`); break;
      case 'invert': parts.push(`invert(${a})`); break;
      default: break; // pixel effects handled separately
    }
  }
  return parts.join(' ');
}

export function hasPixelEffects(effects: VideoEffect[] | undefined): boolean {
  return !!effects?.some(e => e.enabled && ['sharpen', 'vignette', 'grain', 'pixelate', 'mirror', 'posterize', 'chromatic'].includes(e.type));
}

/**
 * Apply pixel-level effects in-place to an ImageData region (already drawn).
 * `seed` keeps grain deterministic across preview/export for a given frame (pass
 * the frame index or a stable per-frame number — Math.random is banned in some
 * contexts and would also make preview != export).
 */
export function applyPixelEffects(data: ImageData, effects: VideoEffect[] | undefined, seed = 0): void {
  if (!effects) return;
  const { width: w, height: h } = data;
  const d = data.data;
  for (const e of effects) {
    if (!e.enabled) continue;
    const a = e.amount / 100;
    switch (e.type) {
      case 'grayscale': case 'sepia': case 'invert': case 'blur': case 'glow':
        break; // handled by CSS filter
      case 'posterize': {
        const levels = Math.max(2, Math.round(2 + (1 - a) * 14));
        const stepv = 255 / (levels - 1);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.round(d[i] / stepv) * stepv;
          d[i + 1] = Math.round(d[i + 1] / stepv) * stepv;
          d[i + 2] = Math.round(d[i + 2] / stepv) * stepv;
        }
        break;
      }
      case 'sharpen': {
        // 3x3 unsharp on a copy.
        const src = new Uint8ClampedArray(d);
        const k = a * 1.2;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            const center = src[i + c];
            const lap = 4 * center - src[i - 4 + c] - src[i + 4 + c] - src[i - w * 4 + c] - src[i + w * 4 + c];
            d[i + c] = Math.max(0, Math.min(255, center + lap * k));
          }
        }
        break;
      }
      case 'vignette': {
        const cx = w / 2, cy = h / 2; const maxD = Math.hypot(cx, cy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const dist = Math.hypot(x - cx, y - cy) / maxD;
          const v = 1 - a * Math.pow(Math.max(0, dist - 0.4) / 0.6, 2);
          d[i] *= v; d[i + 1] *= v; d[i + 2] *= v;
        }
        break;
      }
      case 'grain': {
        // Deterministic pseudo-noise from a hash of pixel index + seed.
        const strength = a * 60;
        for (let i = 0; i < d.length; i += 4) {
          const n = ((Math.sin((i + seed * 9301) * 12.9898) * 43758.5453) % 1);
          const g = (n - 0.5) * strength;
          d[i] = Math.max(0, Math.min(255, d[i] + g));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + g));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + g));
        }
        break;
      }
      case 'pixelate': {
        const block = Math.max(2, Math.round(2 + a * 40));
        for (let y = 0; y < h; y += block) for (let x = 0; x < w; x += block) {
          const i0 = (y * w + x) * 4;
          const r = d[i0], gg = d[i0 + 1], b = d[i0 + 2];
          for (let yy = y; yy < Math.min(h, y + block); yy++) for (let xx = x; xx < Math.min(w, x + block); xx++) {
            const i = (yy * w + xx) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b;
          }
        }
        break;
      }
      case 'mirror': {
        // Mirror right half onto left (a == 1 full).
        for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) {
          const i = (y * w + x) * 4; const j = (y * w + (w - 1 - x)) * 4;
          d[i] = src3(d, j, 0); d[i + 1] = src3(d, j, 1); d[i + 2] = src3(d, j, 2);
        }
        break;
      }
      case 'chromatic': {
        // Shift R left and B right by a few px.
        const shift = Math.max(1, Math.round(a * 8));
        const src = new Uint8ClampedArray(d);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const rx = Math.min(w - 1, x + shift), bx = Math.max(0, x - shift);
          d[i] = src[(y * w + rx) * 4];
          d[i + 2] = src[(y * w + bx) * 4 + 2];
        }
        break;
      }
    }
  }
}

function src3(d: Uint8ClampedArray, j: number, c: number): number { return d[j + c]; }
