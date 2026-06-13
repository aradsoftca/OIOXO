// Shared transition library for the Video Studio. ONE source of truth so the live
// preview and the export compositor blend cross-clip transitions IDENTICALLY.
// Each transition is expressed as a canvas setup applied to the INCOMING frame
// (the outgoing/previous frame is already drawn underneath), driven by progress
// p (0→1). Rival bar: CapCut ships dozens of named transitions — this is a solid,
// genuinely useful set that covers the common pro vocabulary.

export type TransitionId =
  | 'none' | 'fade' | 'dissolve'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down'
  | 'zoom-in' | 'zoom-out' | 'circle' | 'blur' | 'spin'
  // legacy ids kept so old projects keep working
  | 'slide' | 'wipe';

export const TRANSITION_LIST: { id: TransitionId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'slide-left', label: 'Slide ←' },
  { id: 'slide-right', label: 'Slide →' },
  { id: 'slide-up', label: 'Slide ↑' },
  { id: 'slide-down', label: 'Slide ↓' },
  { id: 'wipe-left', label: 'Wipe ←' },
  { id: 'wipe-right', label: 'Wipe →' },
  { id: 'wipe-up', label: 'Wipe ↑' },
  { id: 'wipe-down', label: 'Wipe ↓' },
  { id: 'zoom-in', label: 'Zoom in' },
  { id: 'zoom-out', label: 'Zoom out' },
  { id: 'circle', label: 'Circle' },
  { id: 'blur', label: 'Blur' },
  { id: 'spin', label: 'Spin' },
];

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Configure `ctx` (already saved by the caller) to draw the INCOMING frame for
 * the given transition at progress p (0→1). The caller draws the frame right
 * after, then restores. Identical in preview + export. Returns nothing; mutates
 * ctx state (alpha/transform/clip/filter).
 */
export function setupTransition(ctx: Ctx2D, id: TransitionId, p: number, w: number, h: number): void {
  const e = smooth(Math.max(0, Math.min(1, p)));
  switch (id) {
    case 'none':
      return;
    case 'fade':
    case 'dissolve':
      ctx.globalAlpha = e;
      return;
    case 'slide':        // legacy → slide-left behavior (incoming from right)
    case 'slide-left':
      ctx.translate(w * (1 - e), 0); return;
    case 'slide-right':
      ctx.translate(-w * (1 - e), 0); return;
    case 'slide-up':
      ctx.translate(0, h * (1 - e)); return;
    case 'slide-down':
      ctx.translate(0, -h * (1 - e)); return;
    case 'wipe':         // legacy → wipe-left (reveal L→R)
    case 'wipe-left':
      ctx.beginPath(); ctx.rect(0, 0, w * e, h); ctx.clip(); return;
    case 'wipe-right':
      ctx.beginPath(); ctx.rect(w * (1 - e), 0, w * e, h); ctx.clip(); return;
    case 'wipe-up':
      ctx.beginPath(); ctx.rect(0, 0, w, h * e); ctx.clip(); return;
    case 'wipe-down':
      ctx.beginPath(); ctx.rect(0, h * (1 - e), w, h * e); ctx.clip(); return;
    case 'zoom-in': {
      // Incoming grows from small → full, fading in.
      ctx.globalAlpha = e;
      const s = 0.6 + 0.4 * e;
      ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
      return;
    }
    case 'zoom-out': {
      ctx.globalAlpha = e;
      const s = 1.4 - 0.4 * e;
      ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
      return;
    }
    case 'circle': {
      // Iris reveal from center.
      const r = Math.hypot(w, h) / 2 * e;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.clip();
      return;
    }
    case 'blur': {
      ctx.globalAlpha = e;
      (ctx as any).filter = `blur(${(1 - e) * 20}px)`;
      return;
    }
    case 'spin': {
      ctx.globalAlpha = e;
      ctx.translate(w / 2, h / 2);
      ctx.rotate((1 - e) * Math.PI); ctx.scale(0.5 + 0.5 * e, 0.5 + 0.5 * e);
      ctx.translate(-w / 2, -h / 2);
      return;
    }
    default:
      ctx.globalAlpha = e;
  }
}
