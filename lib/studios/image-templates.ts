// Image Studio templates — Canva/Clipchamp-style ready-made designs.
//
// A template is a VECTOR RECIPE: a small JSON description of a canvas plus its
// layers (background, text, shapes, optional baked art). On apply it is
// materialized into the studio's existing `SerializedDoc` shape — the exact
// format `deserializeDoc()` already loads — so there is ZERO new engine work:
// applying a template is identical to opening a saved project.
//
// The recipe stays editable (text is real text, shapes are real shapes) and is
// tiny (a few KB), and the same recipe renders its own gallery thumbnail, so
// the preview always matches the real result. All of this runs in the browser,
// offline, no server, no model.

import { ZERO_ADJUST } from './canvas';

export type ImageTemplateCategory =
  | 'social-post'
  | 'story'
  | 'thumbnail'
  | 'banner'
  | 'marketing'
  | 'document'
  | 'logo'
  | 'quote';

/** A solid fill, or a linear gradient at an angle (deg, 0 = left→right). */
export interface FillSpec {
  kind: 'solid' | 'linear' | 'radial';
  /** Solid: one color. Gradient: 2+ stops (evenly spaced if no offsets). */
  colors: string[];
  /** Linear gradient angle in degrees (0 = →, 90 = ↓). Ignored for solid/radial. */
  angle?: number;
}

interface LayerBaseSpec {
  /** 0..1, default 1. */
  opacity?: number;
  /** Canvas blend mode, default 'source-over'. */
  blend?: GlobalCompositeOperation;
  name?: string;
}

/** A full-canvas background (solid or gradient). Always the bottom layer. */
export interface BackgroundSpec extends LayerBaseSpec {
  kind: 'background';
  fill: FillSpec;
}

/** A rectangle or ellipse. Coords are fractions of canvas size (0..1) so a
 *  template scales to any resolution; resolved to px at materialize time. */
export interface ShapeSpec extends LayerBaseSpec {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  x: number; y: number; w: number; h: number; // fractions of canvas w/h
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  /** Corner radius in px (rect only). */
  radius?: number;
}

/** A text layer. `x`/`y` are fractions of canvas size; `align` decides the
 *  horizontal anchor at `x`. `size` is a fraction of canvas height. */
export interface TextSpec extends LayerBaseSpec {
  kind: 'text';
  text: string;
  x: number; y: number;      // fractions (anchor point)
  size: number;              // fraction of canvas height
  color: string;
  font?: string;             // CSS font-family, default Impact for headlines
  weight?: number;
  italic?: boolean;
  align?: CanvasTextAlign;   // default 'center'
  lineHeight?: number;       // multiplier, default 1.1
  letterSpacing?: number;    // px, default 0
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;     // px
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
}

export type LayerSpec = BackgroundSpec | ShapeSpec | TextSpec;

export interface ImageTemplate {
  id: string;
  name: string;
  category: ImageTemplateCategory;
  description: string;
  /** Output canvas size in px. */
  width: number;
  height: number;
  layers: LayerSpec[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog. ~20 ready-made designs across 7 categories. Coordinates are
// fractions of the canvas, so every template is resolution-independent.
// ─────────────────────────────────────────────────────────────────────────────

const IMPACT = 'Impact, sans-serif';
const SANS = 'Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, serif';
const MONO = 'Courier New, monospace';

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  // ── SOCIAL POST (1080×1080) ────────────────────────────────────────────────
  {
    id: 'post-bold-quote', name: 'Bold Quote', category: 'social-post',
    description: 'Punchy centered quote on a vivid gradient.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#7c3aed', '#ec4899'] } },
      { kind: 'text', text: '"GREAT THINGS\nNEVER COME\nFROM COMFORT\nZONES"', x: 0.5, y: 0.42, size: 0.085, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.12 },
      { kind: 'shape', shape: 'rect', x: 0.38, y: 0.66, w: 0.24, h: 0.006, fill: '#ffe14d' },
      { kind: 'text', text: '@yourhandle', x: 0.5, y: 0.74, size: 0.032, color: '#ffe14d', font: SANS, weight: 700, align: 'center' },
    ],
  },
  {
    id: 'post-announcement', name: 'Big Announcement', category: 'social-post',
    description: 'Attention-grabbing announcement card.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#0f172a'] } },
      { kind: 'shape', shape: 'rect', x: 0.08, y: 0.08, w: 0.84, h: 0.84, fill: 'transparent', stroke: '#22d3ee', strokeWidth: 6, radius: 24 },
      { kind: 'text', text: 'BIG NEWS', x: 0.5, y: 0.34, size: 0.13, color: '#22d3ee', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'Something exciting is\ncoming your way', x: 0.5, y: 0.55, size: 0.045, color: '#e2e8f0', font: SANS, weight: 400, align: 'center', lineHeight: 1.3 },
      { kind: 'shape', shape: 'rect', x: 0.32, y: 0.7, w: 0.36, h: 0.09, fill: '#22d3ee', radius: 40 },
      { kind: 'text', text: 'LEARN MORE', x: 0.5, y: 0.745, size: 0.03, color: '#0f172a', font: SANS, weight: 800, align: 'center' },
    ],
  },
  {
    id: 'post-sale', name: 'Sale Flash', category: 'social-post',
    description: 'High-energy discount post.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'radial', colors: ['#ff0040', '#7a001e'] } },
      { kind: 'text', text: 'FLASH SALE', x: 0.5, y: 0.22, size: 0.075, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', outline: true, outlineColor: '#000000', outlineWidth: 6 },
      { kind: 'text', text: '50%', x: 0.5, y: 0.5, size: 0.34, color: '#ffe14d', font: IMPACT, weight: 900, align: 'center', shadow: true, shadowColor: 'rgba(0,0,0,.4)', shadowBlur: 30 },
      { kind: 'text', text: 'OFF EVERYTHING', x: 0.5, y: 0.72, size: 0.06, color: '#ffffff', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'TODAY ONLY · CODE: FLASH50', x: 0.5, y: 0.85, size: 0.028, color: '#ffe14d', font: SANS, weight: 700, align: 'center' },
    ],
  },
  {
    id: 'post-minimal', name: 'Minimal Statement', category: 'social-post',
    description: 'Clean editorial single-line statement.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#f5f3ef'] } },
      { kind: 'text', text: 'less\nbut\nbetter.', x: 0.12, y: 0.46, size: 0.13, color: '#1a1a1a', font: SERIF, weight: 400, italic: true, align: 'left', lineHeight: 1.0 },
      { kind: 'shape', shape: 'rect', x: 0.12, y: 0.72, w: 0.18, h: 0.004, fill: '#1a1a1a' },
      { kind: 'text', text: 'DESIGN PRINCIPLES', x: 0.12, y: 0.78, size: 0.022, color: '#666', font: SANS, weight: 700, align: 'left', letterSpacing: 3 },
    ],
  },
  {
    id: 'post-tip', name: 'Tip Carousel Cover', category: 'social-post',
    description: 'Numbered tip / listicle cover.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#0ea5e9', '#1e3a8a'] } },
      { kind: 'text', text: '5', x: 0.18, y: 0.32, size: 0.28, color: 'rgba(255,255,255,.18)', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'TIPS TO\nGROW FASTER', x: 0.5, y: 0.52, size: 0.085, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.1 },
      { kind: 'text', text: 'swipe →', x: 0.5, y: 0.82, size: 0.035, color: '#ffe14d', font: SANS, weight: 700, align: 'center' },
    ],
  },

  // ── STORY / REEL COVER (1080×1920) ──────────────────────────────────────────
  {
    id: 'story-now', name: 'Story — Now', category: 'story',
    description: 'Vertical story with a top label and CTA.',
    width: 1080, height: 1920,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 120, colors: ['#f97316', '#db2777'] } },
      { kind: 'shape', shape: 'rect', x: 0.3, y: 0.07, w: 0.4, h: 0.05, fill: 'rgba(0,0,0,.35)', radius: 40 },
      { kind: 'text', text: 'JUST IN', x: 0.5, y: 0.095, size: 0.02, color: '#ffffff', font: SANS, weight: 800, align: 'center', letterSpacing: 4 },
      { kind: 'text', text: 'BEHIND\nTHE\nSCENES', x: 0.5, y: 0.45, size: 0.11, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.0, shadow: true, shadowColor: 'rgba(0,0,0,.35)', shadowBlur: 24 },
      { kind: 'text', text: 'tap to watch', x: 0.5, y: 0.9, size: 0.028, color: '#ffffff', font: SANS, weight: 600, align: 'center' },
    ],
  },
  {
    id: 'story-quote', name: 'Story — Soft Quote', category: 'story',
    description: 'Calm vertical quote with serif type.',
    width: 1080, height: 1920,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 180, colors: ['#fef3c7', '#fcd9b8'] } },
      { kind: 'text', text: '“', x: 0.5, y: 0.28, size: 0.22, color: '#b45309', font: SERIF, weight: 700, align: 'center' },
      { kind: 'text', text: 'breathe in\ncalm,\nbreathe out\nchaos', x: 0.5, y: 0.5, size: 0.06, color: '#7c2d12', font: SERIF, weight: 400, italic: true, align: 'center', lineHeight: 1.25 },
      { kind: 'shape', shape: 'ellipse', x: 0.45, y: 0.72, w: 0.1, h: 0.056, fill: '#b45309' },
    ],
  },
  {
    id: 'story-event', name: 'Story — Event Invite', category: 'story',
    description: 'Vertical event / launch invite.',
    width: 1080, height: 1920,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#09090b'] } },
      { kind: 'shape', shape: 'rect', x: 0.0, y: 0.0, w: 1, h: 0.012, fill: '#a855f7' },
      { kind: 'text', text: "YOU'RE\nINVITED", x: 0.5, y: 0.3, size: 0.11, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.0 },
      { kind: 'text', text: 'FRI · 8PM · THE LOFT', x: 0.5, y: 0.55, size: 0.035, color: '#a855f7', font: MONO, weight: 700, align: 'center', letterSpacing: 2 },
      { kind: 'shape', shape: 'rect', x: 0.25, y: 0.66, w: 0.5, h: 0.002, fill: 'rgba(255,255,255,.3)' },
      { kind: 'text', text: 'RSVP in bio', x: 0.5, y: 0.74, size: 0.03, color: '#e4e4e7', font: SANS, weight: 500, align: 'center' },
      { kind: 'shape', shape: 'rect', x: 0.0, y: 0.988, w: 1, h: 0.012, fill: '#a855f7' },
    ],
  },

  // ── YOUTUBE THUMBNAIL (1280×720) ────────────────────────────────────────────
  {
    id: 'thumb-shocked', name: 'YouTube — Hook', category: 'thumbnail',
    description: 'Loud thumbnail with a left text block.',
    width: 1280, height: 720,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 90, colors: ['#1e1b4b', '#000000'] } },
      { kind: 'shape', shape: 'rect', x: 0.0, y: 0.0, w: 0.58, h: 1, fill: 'rgba(0,0,0,.45)' },
      { kind: 'text', text: 'I TRIED\nTHIS FOR\n30 DAYS', x: 0.03, y: 0.46, size: 0.16, color: '#ffffff', font: IMPACT, weight: 900, align: 'left', lineHeight: 1.02, outline: true, outlineColor: '#000', outlineWidth: 8 },
      { kind: 'text', text: 'SHOCKING', x: 0.03, y: 0.82, size: 0.075, color: '#ffe14d', font: IMPACT, weight: 900, align: 'left', outline: true, outlineColor: '#000', outlineWidth: 6 },
      { kind: 'shape', shape: 'ellipse', x: 0.7, y: 0.18, w: 0.22, h: 0.39, fill: 'transparent', stroke: '#ff0040', strokeWidth: 12 },
    ],
  },
  {
    id: 'thumb-vs', name: 'YouTube — VS', category: 'thumbnail',
    description: 'Split comparison thumbnail.',
    width: 1280, height: 720,
    layers: [
      { kind: 'shape', shape: 'rect', x: 0.0, y: 0.0, w: 0.5, h: 1, fill: '#1d4ed8' },
      { kind: 'shape', shape: 'rect', x: 0.5, y: 0.0, w: 0.5, h: 1, fill: '#b91c1c' },
      { kind: 'text', text: 'CHEAP', x: 0.25, y: 0.5, size: 0.16, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', outline: true, outlineColor: '#000', outlineWidth: 6 },
      { kind: 'text', text: 'PRO', x: 0.75, y: 0.5, size: 0.16, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', outline: true, outlineColor: '#000', outlineWidth: 6 },
      { kind: 'shape', shape: 'ellipse', x: 0.42, y: 0.36, w: 0.16, h: 0.28, fill: '#ffe14d' },
      { kind: 'text', text: 'VS', x: 0.5, y: 0.5, size: 0.12, color: '#000000', font: IMPACT, weight: 900, align: 'center' },
    ],
  },
  {
    id: 'thumb-tutorial', name: 'YouTube — Tutorial', category: 'thumbnail',
    description: 'Clean tutorial thumbnail with a tag.',
    width: 1280, height: 720,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#0ea5e9', '#6366f1'] } },
      { kind: 'shape', shape: 'rect', x: 0.04, y: 0.08, w: 0.26, h: 0.12, fill: '#ffe14d', radius: 12 },
      { kind: 'text', text: 'TUTORIAL', x: 0.17, y: 0.14, size: 0.05, color: '#1a1a1a', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'BUILD A WEBSITE\nIN 10 MINUTES', x: 0.04, y: 0.55, size: 0.115, color: '#ffffff', font: IMPACT, weight: 900, align: 'left', lineHeight: 1.05, shadow: true, shadowColor: 'rgba(0,0,0,.35)', shadowBlur: 16 },
    ],
  },

  // ── BANNER / COVER (1500×500 Twitter/X header) ──────────────────────────────
  {
    id: 'banner-personal', name: 'X / Twitter Header', category: 'banner',
    description: 'Personal-brand header with name + tagline.',
    width: 1500, height: 500,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 110, colors: ['#0f172a', '#312e81'] } },
      { kind: 'shape', shape: 'ellipse', x: 0.72, y: -0.2, w: 0.5, h: 1.6, fill: 'rgba(99,102,241,.25)' },
      { kind: 'text', text: 'JANE DOE', x: 0.04, y: 0.4, size: 0.2, color: '#ffffff', font: IMPACT, weight: 900, align: 'left' },
      { kind: 'text', text: 'Designer · Builder · Writing about craft', x: 0.04, y: 0.66, size: 0.07, color: '#a5b4fc', font: SANS, weight: 500, align: 'left' },
    ],
  },
  {
    id: 'banner-linkedin', name: 'LinkedIn Cover', category: 'banner',
    description: 'Professional LinkedIn background banner.',
    width: 1584, height: 396,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 90, colors: ['#075985', '#0c4a6e'] } },
      { kind: 'shape', shape: 'rect', x: 0.0, y: 0.78, w: 1, h: 0.22, fill: 'rgba(255,255,255,.06)' },
      { kind: 'text', text: 'Helping teams ship better software', x: 0.5, y: 0.42, size: 0.13, color: '#ffffff', font: SANS, weight: 700, align: 'center' },
      { kind: 'text', text: 'PRODUCT  ·  STRATEGY  ·  GROWTH', x: 0.5, y: 0.63, size: 0.06, color: '#7dd3fc', font: SANS, weight: 600, align: 'center', letterSpacing: 4 },
    ],
  },

  // ── MARKETING (1080×1350 portrait ad) ───────────────────────────────────────
  {
    id: 'mktg-product', name: 'Product Feature', category: 'marketing',
    description: 'Portrait product ad with a price chip.',
    width: 1080, height: 1350,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#fafafa', '#e5e7eb'] } },
      { kind: 'shape', shape: 'ellipse', x: 0.15, y: 0.18, w: 0.7, h: 0.5, fill: '#ffffff' },
      { kind: 'text', text: 'NEW', x: 0.5, y: 0.12, size: 0.04, color: '#ef4444', font: SANS, weight: 900, align: 'center', letterSpacing: 6 },
      { kind: 'text', text: 'The Everyday\nEssential', x: 0.5, y: 0.74, size: 0.075, color: '#111827', font: SERIF, weight: 600, align: 'center', lineHeight: 1.1 },
      { kind: 'shape', shape: 'rect', x: 0.36, y: 0.85, w: 0.28, h: 0.07, fill: '#111827', radius: 40 },
      { kind: 'text', text: '$49', x: 0.5, y: 0.885, size: 0.035, color: '#ffffff', font: SANS, weight: 800, align: 'center' },
      { kind: 'text', text: 'Free shipping worldwide', x: 0.5, y: 0.95, size: 0.026, color: '#6b7280', font: SANS, weight: 500, align: 'center' },
    ],
  },
  {
    id: 'mktg-webinar', name: 'Webinar Promo', category: 'marketing',
    description: 'Event promo with date + speaker line.',
    width: 1080, height: 1350,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#4c1d95', '#9d174d'] } },
      { kind: 'text', text: 'FREE WEBINAR', x: 0.5, y: 0.16, size: 0.035, color: '#fbcfe8', font: SANS, weight: 800, align: 'center', letterSpacing: 5 },
      { kind: 'text', text: 'Scaling Your\nSide Project', x: 0.5, y: 0.36, size: 0.095, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.05 },
      { kind: 'shape', shape: 'rect', x: 0.2, y: 0.54, w: 0.6, h: 0.002, fill: 'rgba(255,255,255,.4)' },
      { kind: 'text', text: 'THU · JUNE 26 · 6PM', x: 0.5, y: 0.62, size: 0.04, color: '#fbcfe8', font: MONO, weight: 700, align: 'center' },
      { kind: 'text', text: 'with Alex Rivera', x: 0.5, y: 0.7, size: 0.034, color: '#ffffff', font: SERIF, weight: 400, italic: true, align: 'center' },
      { kind: 'shape', shape: 'rect', x: 0.28, y: 0.82, w: 0.44, h: 0.08, fill: '#fbbf24', radius: 40 },
      { kind: 'text', text: 'SAVE MY SEAT', x: 0.5, y: 0.86, size: 0.032, color: '#4c1d95', font: SANS, weight: 900, align: 'center' },
    ],
  },

  // ── LOGO / WORDMARK (800×800) ───────────────────────────────────────────────
  {
    id: 'logo-badge', name: 'Badge Logo', category: 'logo',
    description: 'Circular badge wordmark.',
    width: 800, height: 800,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#0c0a09'] } },
      { kind: 'shape', shape: 'ellipse', x: 0.12, y: 0.12, w: 0.76, h: 0.76, fill: 'transparent', stroke: '#eab308', strokeWidth: 8 },
      { kind: 'shape', shape: 'ellipse', x: 0.17, y: 0.17, w: 0.66, h: 0.66, fill: 'transparent', stroke: '#eab308', strokeWidth: 2 },
      { kind: 'text', text: 'NORTH', x: 0.5, y: 0.46, size: 0.16, color: '#eab308', font: IMPACT, weight: 900, align: 'center', letterSpacing: 4 },
      { kind: 'text', text: 'EST · 2026', x: 0.5, y: 0.6, size: 0.04, color: '#fde68a', font: SANS, weight: 600, align: 'center', letterSpacing: 6 },
    ],
  },
  {
    id: 'logo-mono', name: 'Monogram', category: 'logo',
    description: 'Minimal lettermark on a soft gradient.',
    width: 800, height: 800,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#1e293b', '#0f172a'] } },
      { kind: 'shape', shape: 'rect', x: 0.28, y: 0.28, w: 0.44, h: 0.44, fill: 'transparent', stroke: '#38bdf8', strokeWidth: 6, radius: 24 },
      { kind: 'text', text: 'JD', x: 0.5, y: 0.5, size: 0.22, color: '#38bdf8', font: SERIF, weight: 700, align: 'center' },
    ],
  },

  // ── QUOTE / TYPOGRAPHY (1080×1080) ──────────────────────────────────────────
  {
    id: 'quote-gradient', name: 'Gradient Quote', category: 'quote',
    description: 'Centered quote with attribution.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 120, colors: ['#0891b2', '#7c3aed'] } },
      { kind: 'text', text: '“The best way to\npredict the future\nis to create it.”', x: 0.5, y: 0.42, size: 0.062, color: '#ffffff', font: SERIF, weight: 400, italic: true, align: 'center', lineHeight: 1.3 },
      { kind: 'shape', shape: 'rect', x: 0.42, y: 0.64, w: 0.16, h: 0.004, fill: '#ffffff' },
      { kind: 'text', text: 'PETER DRUCKER', x: 0.5, y: 0.7, size: 0.028, color: '#e0f2fe', font: SANS, weight: 700, align: 'center', letterSpacing: 4 },
    ],
  },
  {
    id: 'quote-dark', name: 'Dark Mode Quote', category: 'quote',
    description: 'High-contrast quote, accent word highlighted.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#09090b'] } },
      { kind: 'shape', shape: 'rect', x: 0.1, y: 0.36, w: 0.8, h: 0.1, fill: '#22c55e' },
      { kind: 'text', text: 'STAY', x: 0.5, y: 0.27, size: 0.1, color: '#ffffff', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'HUNGRY', x: 0.5, y: 0.41, size: 0.1, color: '#09090b', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'STAY FOOLISH', x: 0.5, y: 0.56, size: 0.1, color: '#ffffff', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: '— STEVE JOBS', x: 0.5, y: 0.74, size: 0.026, color: '#71717a', font: SANS, weight: 600, align: 'center', letterSpacing: 3 },
    ],
  },

  // ── DOCUMENT (A4 portrait 794×1123 @ ~96dpi) ────────────────────────────────
  {
    id: 'resume-modern', name: 'Modern Resume', category: 'document',
    description: 'Clean two-tone résumé with a sidebar header.',
    width: 794, height: 1123,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#ffffff'] } },
      { kind: 'shape', shape: 'rect', x: 0, y: 0, w: 1, h: 0.16, fill: '#1e3a5f' },
      { kind: 'text', text: 'YOUR NAME', x: 0.06, y: 0.07, size: 0.04, color: '#ffffff', font: SANS, weight: 800, align: 'left', letterSpacing: 2 },
      { kind: 'text', text: 'Job Title · City · email · phone', x: 0.06, y: 0.115, size: 0.018, color: '#cbd5e1', font: SANS, weight: 400, align: 'left' },
      { kind: 'text', text: 'EXPERIENCE', x: 0.06, y: 0.22, size: 0.022, color: '#1e3a5f', font: SANS, weight: 800, align: 'left', letterSpacing: 2 },
      { kind: 'shape', shape: 'rect', x: 0.06, y: 0.24, w: 0.88, h: 0.003, fill: '#1e3a5f' },
      { kind: 'text', text: 'Senior Role — Company', x: 0.06, y: 0.28, size: 0.02, color: '#0f172a', font: SANS, weight: 700, align: 'left' },
      { kind: 'text', text: '2022 – Present', x: 0.06, y: 0.305, size: 0.016, color: '#64748b', font: SANS, weight: 400, align: 'left' },
      { kind: 'text', text: '• Achievement or responsibility goes here', x: 0.06, y: 0.34, size: 0.016, color: '#334155', font: SANS, weight: 400, align: 'left' },
      { kind: 'text', text: '• Another measurable result', x: 0.06, y: 0.365, size: 0.016, color: '#334155', font: SANS, weight: 400, align: 'left' },
      { kind: 'text', text: 'EDUCATION', x: 0.06, y: 0.47, size: 0.022, color: '#1e3a5f', font: SANS, weight: 800, align: 'left', letterSpacing: 2 },
      { kind: 'shape', shape: 'rect', x: 0.06, y: 0.49, w: 0.88, h: 0.003, fill: '#1e3a5f' },
      { kind: 'text', text: 'Degree — University, Year', x: 0.06, y: 0.53, size: 0.018, color: '#0f172a', font: SANS, weight: 600, align: 'left' },
      { kind: 'text', text: 'SKILLS', x: 0.06, y: 0.63, size: 0.022, color: '#1e3a5f', font: SANS, weight: 800, align: 'left', letterSpacing: 2 },
      { kind: 'shape', shape: 'rect', x: 0.06, y: 0.65, w: 0.88, h: 0.003, fill: '#1e3a5f' },
      { kind: 'text', text: 'Skill · Skill · Skill · Skill · Skill', x: 0.06, y: 0.69, size: 0.017, color: '#334155', font: SANS, weight: 400, align: 'left' },
    ],
  },
  {
    id: 'cover-letter', name: 'Cover Letter', category: 'document',
    description: 'Formal letter with header and signature block.',
    width: 794, height: 1123,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#ffffff'] } },
      { kind: 'text', text: 'Your Name', x: 0.08, y: 0.08, size: 0.03, color: '#0f172a', font: SERIF, weight: 700, align: 'left' },
      { kind: 'text', text: 'address · email · phone', x: 0.08, y: 0.115, size: 0.016, color: '#64748b', font: SANS, weight: 400, align: 'left' },
      { kind: 'shape', shape: 'rect', x: 0.08, y: 0.14, w: 0.84, h: 0.002, fill: '#cbd5e1' },
      { kind: 'text', text: 'Date', x: 0.08, y: 0.2, size: 0.017, color: '#334155', font: SERIF, weight: 400, align: 'left' },
      { kind: 'text', text: 'Dear Hiring Manager,', x: 0.08, y: 0.27, size: 0.018, color: '#0f172a', font: SERIF, weight: 400, align: 'left' },
      { kind: 'text', text: 'Opening paragraph — why you are\nwriting and the role you want.', x: 0.08, y: 0.34, size: 0.017, color: '#334155', font: SERIF, weight: 400, align: 'left', lineHeight: 1.5 },
      { kind: 'text', text: 'Body paragraph — your fit, key\nachievements, and value you bring.', x: 0.08, y: 0.46, size: 0.017, color: '#334155', font: SERIF, weight: 400, align: 'left', lineHeight: 1.5 },
      { kind: 'text', text: 'Sincerely,', x: 0.08, y: 0.62, size: 0.017, color: '#0f172a', font: SERIF, weight: 400, align: 'left' },
      { kind: 'text', text: 'Your Name', x: 0.08, y: 0.67, size: 0.02, color: '#0f172a', font: SERIF, weight: 700, align: 'left' },
    ],
  },
  {
    id: 'report-cover', name: 'Report Cover', category: 'document',
    description: 'Bold title page for reports and proposals.',
    width: 794, height: 1123,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#0f172a', '#1e3a5f'] } },
      { kind: 'shape', shape: 'rect', x: 0.08, y: 0.42, w: 0.3, h: 0.008, fill: '#22d3ee' },
      { kind: 'text', text: 'ANNUAL\nREPORT', x: 0.08, y: 0.34, size: 0.075, color: '#ffffff', font: IMPACT, weight: 900, align: 'left', lineHeight: 1.0 },
      { kind: 'text', text: '2026', x: 0.08, y: 0.5, size: 0.04, color: '#22d3ee', font: SANS, weight: 800, align: 'left' },
      { kind: 'text', text: 'Company Name', x: 0.08, y: 0.9, size: 0.024, color: '#ffffff', font: SANS, weight: 600, align: 'left' },
      { kind: 'text', text: 'Prepared by · Department', x: 0.08, y: 0.93, size: 0.016, color: '#94a3b8', font: SANS, weight: 400, align: 'left' },
    ],
  },
  {
    id: 'certificate', name: 'Certificate', category: 'document',
    description: 'Award certificate with ornamental border.',
    width: 1123, height: 794,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#fffdf7'] } },
      { kind: 'shape', shape: 'rect', x: 0.04, y: 0.06, w: 0.92, h: 0.88, fill: 'transparent', stroke: '#b8860b', strokeWidth: 6 },
      { kind: 'shape', shape: 'rect', x: 0.06, y: 0.09, w: 0.88, h: 0.82, fill: 'transparent', stroke: '#b8860b', strokeWidth: 2 },
      { kind: 'text', text: 'CERTIFICATE', x: 0.5, y: 0.22, size: 0.07, color: '#1e293b', font: SERIF, weight: 700, align: 'center', letterSpacing: 6 },
      { kind: 'text', text: 'OF ACHIEVEMENT', x: 0.5, y: 0.32, size: 0.028, color: '#b8860b', font: SANS, weight: 700, align: 'center', letterSpacing: 8 },
      { kind: 'text', text: 'This certificate is proudly presented to', x: 0.5, y: 0.44, size: 0.022, color: '#475569', font: SERIF, weight: 400, italic: true, align: 'center' },
      { kind: 'text', text: 'Recipient Name', x: 0.5, y: 0.56, size: 0.06, color: '#1e293b', font: SERIF, weight: 700, align: 'center' },
      { kind: 'shape', shape: 'rect', x: 0.34, y: 0.64, w: 0.32, h: 0.002, fill: '#b8860b' },
      { kind: 'text', text: 'for outstanding accomplishment', x: 0.5, y: 0.7, size: 0.02, color: '#475569', font: SERIF, weight: 400, italic: true, align: 'center' },
    ],
  },
  {
    id: 'business-card', name: 'Business Card', category: 'document',
    description: 'Double-sided-ready business card front.',
    width: 1050, height: 600,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#111827', '#1f2937'] } },
      { kind: 'shape', shape: 'rect', x: 0, y: 0, w: 0.02, h: 1, fill: '#22d3ee' },
      { kind: 'text', text: 'YOUR NAME', x: 0.08, y: 0.34, size: 0.09, color: '#ffffff', font: SANS, weight: 800, align: 'left', letterSpacing: 1 },
      { kind: 'text', text: 'Job Title', x: 0.08, y: 0.46, size: 0.05, color: '#22d3ee', font: SANS, weight: 500, align: 'left' },
      { kind: 'text', text: 'email@company.com', x: 0.08, y: 0.66, size: 0.04, color: '#cbd5e1', font: SANS, weight: 400, align: 'left' },
      { kind: 'text', text: '+1 (555) 000-0000', x: 0.08, y: 0.74, size: 0.04, color: '#cbd5e1', font: SANS, weight: 400, align: 'left' },
    ],
  },
  {
    id: 'flyer', name: 'Event Flyer', category: 'document',
    description: 'Eye-catching A4 event flyer.',
    width: 794, height: 1123,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#7c3aed', '#db2777'] } },
      { kind: 'shape', shape: 'ellipse', x: 0.55, y: -0.1, w: 0.7, h: 0.5, fill: 'rgba(255,255,255,.1)' },
      { kind: 'text', text: 'LIVE', x: 0.08, y: 0.18, size: 0.04, color: '#ffe14d', font: IMPACT, weight: 900, align: 'left', letterSpacing: 4 },
      { kind: 'text', text: 'SUMMER\nFEST 2026', x: 0.08, y: 0.32, size: 0.08, color: '#ffffff', font: IMPACT, weight: 900, align: 'left', lineHeight: 1.0 },
      { kind: 'shape', shape: 'rect', x: 0.08, y: 0.52, w: 0.5, h: 0.004, fill: '#ffe14d' },
      { kind: 'text', text: 'SATURDAY · JULY 18 · 7PM', x: 0.08, y: 0.6, size: 0.026, color: '#ffffff', font: SANS, weight: 700, align: 'left' },
      { kind: 'text', text: 'Central Park Amphitheater', x: 0.08, y: 0.65, size: 0.022, color: '#fce7f3', font: SANS, weight: 400, align: 'left' },
      { kind: 'shape', shape: 'rect', x: 0.08, y: 0.82, w: 0.46, h: 0.07, fill: '#ffe14d', radius: 40 },
      { kind: 'text', text: 'GET TICKETS', x: 0.31, y: 0.855, size: 0.026, color: '#7c3aed', font: SANS, weight: 900, align: 'center' },
    ],
  },

  // ── MORE SOCIAL POSTS (extra depth, 1080×1080) ──────────────────────────────
  {
    id: 'post-testimonial', name: 'Testimonial Card', category: 'social-post',
    description: '5-star customer quote card.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'solid', colors: ['#f8fafc'] } },
      { kind: 'shape', shape: 'rect', x: 0.1, y: 0.16, w: 0.8, h: 0.68, fill: '#ffffff', stroke: '#e2e8f0', strokeWidth: 2, radius: 24 },
      { kind: 'text', text: '★★★★★', x: 0.5, y: 0.3, size: 0.05, color: '#fbbf24', font: SANS, weight: 700, align: 'center' },
      { kind: 'text', text: '"This completely changed\nhow our team works."', x: 0.5, y: 0.48, size: 0.045, color: '#0f172a', font: SERIF, weight: 400, italic: true, align: 'center', lineHeight: 1.35 },
      { kind: 'text', text: '— Jordan, Product Lead', x: 0.5, y: 0.66, size: 0.026, color: '#64748b', font: SANS, weight: 600, align: 'center' },
    ],
  },
  {
    id: 'post-stat', name: 'Big Stat', category: 'social-post',
    description: 'One huge number to stop the scroll.',
    width: 1080, height: 1080,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#059669', '#064e3b'] } },
      { kind: 'text', text: '10×', x: 0.5, y: 0.42, size: 0.3, color: '#ffffff', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'faster than before', x: 0.5, y: 0.64, size: 0.05, color: '#a7f3d0', font: SANS, weight: 600, align: 'center' },
    ],
  },

  // ── MORE STORIES (extra depth, 1080×1920) ───────────────────────────────────
  {
    id: 'story-sale', name: 'Story — Flash Sale', category: 'story',
    description: 'Vertical sale story with code.',
    width: 1080, height: 1920,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#dc2626', '#7f1d1d'] } },
      { kind: 'text', text: 'FLASH\nSALE', x: 0.5, y: 0.32, size: 0.13, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 0.98, outline: true, outlineColor: '#000', outlineWidth: 4 },
      { kind: 'text', text: '40% OFF', x: 0.5, y: 0.56, size: 0.09, color: '#ffe14d', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'shape', shape: 'rect', x: 0.2, y: 0.68, w: 0.6, h: 0.07, fill: '#ffffff', radius: 12 },
      { kind: 'text', text: 'CODE: FLASH40', x: 0.5, y: 0.715, size: 0.03, color: '#dc2626', font: SANS, weight: 900, align: 'center' },
      { kind: 'text', text: 'swipe up to shop', x: 0.5, y: 0.9, size: 0.026, color: '#ffffff', font: SANS, weight: 500, align: 'center' },
    ],
  },

  // ── MORE THUMBNAILS (extra depth, 1280×720) ─────────────────────────────────
  {
    id: 'thumb-number', name: 'YouTube — Listicle', category: 'thumbnail',
    description: 'Big number + topic thumbnail.',
    width: 1280, height: 720,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 135, colors: ['#7c3aed', '#1e1b4b'] } },
      { kind: 'text', text: '7', x: 0.2, y: 0.5, size: 0.55, color: '#ffe14d', font: IMPACT, weight: 900, align: 'center', shadow: true, shadowColor: 'rgba(0,0,0,.4)', shadowBlur: 20 },
      { kind: 'text', text: 'MISTAKES\nTO AVOID', x: 0.62, y: 0.5, size: 0.13, color: '#ffffff', font: IMPACT, weight: 900, align: 'center', lineHeight: 1.0, outline: true, outlineColor: '#000', outlineWidth: 6 },
    ],
  },

  // ── MORE MARKETING (extra depth) ────────────────────────────────────────────
  {
    id: 'mktg-app', name: 'App Launch', category: 'marketing',
    description: 'App store launch announcement.',
    width: 1080, height: 1350,
    layers: [
      { kind: 'background', fill: { kind: 'linear', angle: 160, colors: ['#0ea5e9', '#0c4a6e'] } },
      { kind: 'text', text: 'NOW LIVE', x: 0.5, y: 0.16, size: 0.03, color: '#bae6fd', font: SANS, weight: 800, align: 'center', letterSpacing: 6 },
      { kind: 'shape', shape: 'rect', x: 0.32, y: 0.28, w: 0.36, h: 0.36, fill: '#ffffff', radius: 60 },
      { kind: 'text', text: 'LOGO', x: 0.5, y: 0.46, size: 0.05, color: '#0ea5e9', font: IMPACT, weight: 900, align: 'center' },
      { kind: 'text', text: 'Your App Name', x: 0.5, y: 0.72, size: 0.06, color: '#ffffff', font: SANS, weight: 800, align: 'center' },
      { kind: 'text', text: 'Download on the App Store & Google Play', x: 0.5, y: 0.8, size: 0.024, color: '#bae6fd', font: SANS, weight: 400, align: 'center' },
    ],
  },
];

export function imageTemplatesByCategory(cat: ImageTemplateCategory | 'all'): ImageTemplate[] {
  return cat === 'all' ? IMAGE_TEMPLATES : IMAGE_TEMPLATES.filter(t => t.category === cat);
}

export const IMAGE_TEMPLATE_CATEGORIES: { id: ImageTemplateCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'social-post', label: 'Social Post' },
  { id: 'story', label: 'Story / Reel' },
  { id: 'thumbnail', label: 'Thumbnail' },
  { id: 'banner', label: 'Banner / Cover' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'document', label: 'Document' },
  { id: 'logo', label: 'Logo' },
  { id: 'quote', label: 'Quote' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Serialized-doc shape (mirrors image-studio's SerializedDoc / SerializedLayer).
// We only build the layer kinds the studio's deserializeDoc() understands:
// 'paint' (for the rendered background), 'text', and 'shape'.
// ─────────────────────────────────────────────────────────────────────────────

interface SerializedLayerBase {
  id: string; name: string; visible: boolean; locked: boolean;
  opacity: number; blend: string; adjust: typeof ZERO_ADJUST;
  maskUrl?: string;
}

export interface SerializedDocLike {
  name: string; width: number; height: number;
  background: 'transparent' | string;
  activeId: string | null;
  layers: any[];
}

let _tid = 0;
function tid() { return `TL${++_tid}_${Math.random().toString(36).slice(2, 6)}`; }

function fontFor(t: TextSpec): string {
  return t.font || 'Impact, sans-serif';
}

/** Paint a FillSpec across the whole canvas context. */
function paintFill(ctx: CanvasRenderingContext2D, fill: FillSpec, w: number, h: number) {
  if (fill.kind === 'solid') {
    ctx.fillStyle = fill.colors[0] || '#000000';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (fill.kind === 'radial') {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.05, w / 2, h / 2, Math.max(w, h) * 0.7);
    addStops(g, fill.colors);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    return;
  }
  // linear
  const ang = ((fill.angle ?? 0) * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  const dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  addStops(g, fill.colors);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function addStops(g: CanvasGradient, colors: string[]) {
  if (colors.length === 1) { g.addColorStop(0, colors[0]); g.addColorStop(1, colors[0]); return; }
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
}

/** Render the background spec to a canvas → PNG data URL (a 'paint' layer). */
function renderBackgroundDataUrl(bg: BackgroundSpec, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // Intermediate working asset, not a user export — opt out of the global
  // canvas watermark patch so the brand mark isn't baked into the template's
  // background layer. The mark still applies when the user exports their design.
  c.dataset.nowm = '1';
  const ctx = c.getContext('2d')!;
  paintFill(ctx, bg.fill, w, h);
  return c.toDataURL('image/png');
}

/**
 * Materialize a template recipe into a SerializedDoc that image-studio's
 * deserializeDoc() can load directly. Must run in the browser (uses canvas).
 */
export function materializeImageTemplate(t: ImageTemplate): SerializedDocLike {
  const { width: W, height: H } = t;
  const layers: any[] = [];

  for (const spec of t.layers) {
    const base: SerializedLayerBase = {
      id: tid(),
      name: spec.name || labelFor(spec),
      visible: true,
      locked: false,
      opacity: spec.opacity ?? 1,
      blend: spec.blend || 'source-over',
      adjust: { ...ZERO_ADJUST },
    };

    if (spec.kind === 'background') {
      layers.push({ ...base, kind: 'paint', canvasUrl: renderBackgroundDataUrl(spec, W, H) });
    } else if (spec.kind === 'shape') {
      layers.push({
        ...base, kind: 'shape',
        shape: spec.shape,
        x: Math.round(spec.x * W), y: Math.round(spec.y * H),
        w: Math.round(spec.w * W), h: Math.round(spec.h * H),
        fill: spec.fill,
        stroke: spec.stroke || 'transparent',
        strokeWidth: spec.strokeWidth ?? 0,
        radius: spec.radius ?? 0,
      });
    } else { // text
      // Authoring convention: spec.y is the VERTICAL CENTER of the text block.
      // The studio renders text top-anchored (textBaseline 'top', first line at
      // layer.y, advancing down), so convert center → top here by subtracting
      // half the block height. Keeps templates intuitive to author and makes the
      // applied result match the gallery thumbnail (which centers the block).
      const px = Math.round(spec.size * H);
      const lineCount = spec.text.split('\n').length;
      const lh = px * (spec.lineHeight ?? 1.1);
      const blockH = lh * lineCount;
      const topY = Math.round(spec.y * H - blockH / 2);
      layers.push({
        ...base, kind: 'text',
        text: spec.text,
        x: Math.round(spec.x * W), y: topY,
        size: px,
        color: spec.color,
        font: fontFor(spec),
        weight: spec.weight ?? 900,
        italic: !!spec.italic,
        align: spec.align || 'center',
        letterSpacing: spec.letterSpacing ?? 0,
        lineHeight: spec.lineHeight ?? 1.1,
        outline: !!spec.outline,
        outlineColor: spec.outlineColor || '#000000',
        outlineWidth: spec.outlineWidth ?? 0,
        shadow: !!spec.shadow,
        shadowBlur: spec.shadowBlur ?? 0,
        shadowColor: spec.shadowColor || 'rgba(0,0,0,.5)',
      });
    }
  }

  return {
    name: t.name,
    width: W, height: H,
    background: '#ffffff',
    activeId: layers.length ? layers[layers.length - 1].id : null,
    layers,
  };
}

function labelFor(spec: LayerSpec): string {
  if (spec.kind === 'background') return 'Background';
  if (spec.kind === 'shape') return spec.shape === 'rect' ? 'Rectangle' : 'Ellipse';
  const firstLine = spec.text.split('\n')[0];
  return firstLine.length > 18 ? firstLine.slice(0, 18) + '…' : firstLine || 'Text';
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-thumbnail: render the actual recipe to a small canvas → data URL.
// The gallery preview is the real layout, never a placeholder.
// ─────────────────────────────────────────────────────────────────────────────

export function renderImageThumb(t: ImageTemplate, maxEdge = 360): string {
  const { width: W, height: H } = t;
  const scale = Math.min(maxEdge / W, maxEdge / H, 1);
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.dataset.nowm = '1'; // gallery preview, never a user export → no brand mark
  const ctx = c.getContext('2d')!;

  // White base so transparent areas read as a real canvas.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

  for (const spec of t.layers) {
    ctx.save();
    ctx.globalAlpha = spec.opacity ?? 1;
    ctx.globalCompositeOperation = (spec.blend || 'source-over') as GlobalCompositeOperation;
    if (spec.kind === 'background') {
      paintFill(ctx, spec.fill, w, h);
    } else if (spec.kind === 'shape') {
      drawShape(ctx, spec, w, h, scale);
    } else {
      drawText(ctx, spec, w, h, scale);
    }
    ctx.restore();
  }
  return c.toDataURL('image/png');
}

function drawShape(ctx: CanvasRenderingContext2D, s: ShapeSpec, w: number, h: number, scale: number) {
  const x = s.x * w, y = s.y * h, sw = s.w * w, sh = s.h * h;
  ctx.beginPath();
  if (s.shape === 'ellipse') {
    ctx.ellipse(x + sw / 2, y + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
  } else {
    const r = Math.min((s.radius ?? 0) * scale, sw / 2, sh / 2);
    roundRect(ctx, x, y, sw, sh, r);
  }
  ctx.fillStyle = s.fill; ctx.fill();
  if (s.stroke && (s.strokeWidth ?? 0) > 0) {
    ctx.lineWidth = Math.max(1, (s.strokeWidth ?? 0) * scale);
    ctx.strokeStyle = s.stroke; ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, t: TextSpec, w: number, h: number, scale: number) {
  const size = t.size * h; // t.size is a fraction of canvas height
  ctx.font = `${t.italic ? 'italic ' : ''}${t.weight ?? 900} ${size}px ${t.font || 'Impact, sans-serif'}`;
  ctx.textAlign = t.align || 'center';
  ctx.textBaseline = 'middle';
  const lines = t.text.split('\n');
  const lh = size * (t.lineHeight ?? 1.1);
  const x = t.x * w;
  let y = t.y * h - ((lines.length - 1) * lh) / 2;
  for (const line of lines) {
    if (t.shadow) {
      ctx.save();
      ctx.shadowColor = t.shadowColor || 'rgba(0,0,0,.5)';
      ctx.shadowBlur = (t.shadowBlur ?? 0) * scale;
    }
    if (t.outline && (t.outlineWidth ?? 0) > 0) {
      // outlineWidth is px at full resolution → scale by the thumb ratio.
      ctx.lineWidth = Math.max(1, (t.outlineWidth ?? 0) * scale);
      ctx.strokeStyle = t.outlineColor || '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    if (t.shadow) ctx.restore();
    y += lh;
  }
}
