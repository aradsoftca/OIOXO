// Shared text-animation library for the Video Studio. ONE source of truth used by
// BOTH render paths — the live preview (tools/video-studio/ui.tsx) and the export
// compositor (engines/video/compositor.ts) — so a captioned clip looks identical
// on screen and in the exported file. Each animation maps the clip-local time
// (0..1) to a per-glyph/per-line draw transform. Rival bar: CapCut/Premiere ship
// dozens of "text presets"; this gives a generous, genuinely useful set.

export interface TextAnimSample {
  /** 0..1 opacity multiplier. */
  alpha: number;
  /** Pixel offsets applied to the text block (scaled to frame elsewhere). */
  dx: number;
  dy: number;
  /** Uniform scale around the block center (1 = native). */
  scale: number;
  /** Rotation in radians around the block center. */
  rotate: number;
  /** Per-character reveal fraction 0..1 (typewriter/word-by-word). 1 = all shown. */
  reveal: number;
  /** Optional blur radius in px (blur-in). 0 = none. */
  blur: number;
}

export type TextAnimId =
  | 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'
  | 'pop' | 'bounce' | 'zoom-in' | 'zoom-out' | 'grow' | 'spin-in'
  | 'typewriter' | 'word-by-word' | 'blur-in' | 'drop' | 'wave' | 'neon-flicker';

export const TEXT_ANIMATIONS: { id: TextAnimId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-up', label: 'Slide ↑' },
  { id: 'slide-down', label: 'Slide ↓' },
  { id: 'slide-left', label: 'Slide ←' },
  { id: 'slide-right', label: 'Slide →' },
  { id: 'pop', label: 'Pop' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'zoom-in', label: 'Zoom in' },
  { id: 'zoom-out', label: 'Zoom out' },
  { id: 'grow', label: 'Grow' },
  { id: 'spin-in', label: 'Spin in' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'word-by-word', label: 'Word by word' },
  { id: 'blur-in', label: 'Blur in' },
  { id: 'drop', label: 'Drop' },
  { id: 'wave', label: 'Wave' },
  { id: 'neon-flicker', label: 'Neon flicker' },
];

const NEUTRAL: TextAnimSample = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, reveal: 1, blur: 0 };

// Smoothstep ease for intro ramps.
const ease = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
// Intro window: most animations resolve over the first ~30% of the clip, then a
// matching outro over the last ~20% (so text settles, holds, then exits cleanly).
const introT = (lt: number, win = 0.3) => ease(Math.min(1, lt / win));
const outroT = (lt: number, win = 0.2) => ease(Math.min(1, (1 - lt) / win));

/**
 * Sample a text animation at clip-local time `localT` (0..1). `refPx` is a frame
 * reference (the canvas width) so offsets scale with resolution — pass the same
 * value in preview and export. Pure + deterministic → identical in both paths.
 */
export function sampleTextAnim(id: TextAnimId, localT: number, refPx: number): TextAnimSample {
  const lt = Math.max(0, Math.min(1, localT));
  const u = refPx / 1920; // normalize pixel offsets to the 1920 design width
  const inn = introT(lt);
  const out = outroT(lt);
  const both = Math.min(inn, out); // fade in then out
  switch (id) {
    case 'none':
      return NEUTRAL;
    case 'fade':
      return { ...NEUTRAL, alpha: both };
    case 'slide-up':
      return { ...NEUTRAL, alpha: inn, dy: (1 - inn) * 80 * u };
    case 'slide-down':
      return { ...NEUTRAL, alpha: inn, dy: -(1 - inn) * 80 * u };
    case 'slide-left':
      return { ...NEUTRAL, alpha: inn, dx: (1 - inn) * 160 * u };
    case 'slide-right':
      return { ...NEUTRAL, alpha: inn, dx: -(1 - inn) * 160 * u };
    case 'pop':
      return { ...NEUTRAL, alpha: Math.min(1, lt * 8), scale: 0.6 + 0.4 * inn };
    case 'bounce': {
      // Overshoot then settle.
      const s = inn < 1 ? 0.5 + inn * (1.15 - 0.5) : 1 + Math.sin((lt - 0.3) * 12) * 0.04 * Math.max(0, 1 - (lt - 0.3) * 3);
      return { ...NEUTRAL, alpha: inn, scale: s };
    }
    case 'zoom-in':
      return { ...NEUTRAL, alpha: inn, scale: 0.2 + 0.8 * inn };
    case 'zoom-out':
      return { ...NEUTRAL, alpha: inn, scale: 2.2 - 1.2 * inn };
    case 'grow':
      // Grows across the WHOLE clip (the "grow during time" case) — slow, dramatic.
      return { ...NEUTRAL, alpha: Math.min(1, lt * 6), scale: 0.4 + 1.1 * ease(lt) };
    case 'spin-in':
      return { ...NEUTRAL, alpha: inn, scale: 0.3 + 0.7 * inn, rotate: (1 - inn) * Math.PI * 1.5 };
    case 'typewriter':
      return { ...NEUTRAL, reveal: Math.min(1, lt / 0.6) };
    case 'word-by-word':
      return { ...NEUTRAL, reveal: Math.min(1, lt / 0.7) };
    case 'blur-in':
      return { ...NEUTRAL, alpha: inn, blur: (1 - inn) * 14 * u };
    case 'drop':
      // Falls from above, slight squash on land.
      return { ...NEUTRAL, alpha: Math.min(1, lt * 6), dy: -(1 - ease(Math.min(1, lt / 0.25))) * 200 * u };
    case 'wave':
      // Continuous gentle vertical wave (whole-block) — never fully still.
      return { ...NEUTRAL, dy: Math.sin(lt * Math.PI * 4) * 10 * u };
    case 'neon-flicker': {
      // Flicker on during intro then steady.
      const flick = lt < 0.25 ? (Math.sin(lt * 80) > -0.3 ? 1 : 0.35) : 1;
      return { ...NEUTRAL, alpha: flick * both };
    }
    default:
      return NEUTRAL;
  }
}
