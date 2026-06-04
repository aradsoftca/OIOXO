/**
 * Shared canvas element model (CCW C3 + C2).
 *
 * One free-canvas element model + renderer used by Slides, Poster, Thumbnail,
 * Meme, and Collage — replacing each studio's bespoke "title + body textarea"
 * or fixed-grid layout. Elements have free position / size / rotation / z-order
 * / opacity; text/shape/image variants carry their own fields. The renderer is
 * pure (canvas 2D) so the same draw path serves the live preview AND PNG/PDF
 * export, and the interaction hook (element-canvas.tsx) gives every consumer
 * drag + 8-handle resize + rotate for free (the "number-input-only, no rotation"
 * toy tell across 5 studios, killed once).
 *
 * Coordinates are in the element's OWN design space (e.g. a 1920×1080 slide or a
 * 1080×1350 poster); consumers scale the canvas to fit. x/y is the top-left of
 * the element's unrotated box; rotation is degrees about the box center.
 */

export type ElementKind = 'text' | 'shape' | 'image';

export interface BaseElement {
  id: string;
  kind: ElementKind;
  x: number; y: number; w: number; h: number;
  rotation: number;   // degrees, about center
  opacity: number;    // 0..1
  locked?: boolean;
}

export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  font: string;        // CSS font-family
  fontSize: number;    // px in design space
  color: string;
  weight: number;      // 100..900
  italic: boolean;
  align: CanvasTextAlign;
  lineHeight: number;  // multiple of fontSize
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
}

export interface ShapeElement extends BaseElement {
  kind: 'shape';
  shape: 'rect' | 'ellipse' | 'line' | 'roundedRect';
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;      // for roundedRect
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  /** Loaded synchronously by the consumer; the renderer just draws it. */
  img: CanvasImageSource;
  fit: 'cover' | 'contain' | 'fill';
}

export type CanvasElement = TextElement | ShapeElement | ImageElement;

let _eid = 0;
export const elementId = () => `el_${++_eid}_${Math.round(performance.now() % 1e6)}`;

export function makeText(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: elementId(), kind: 'text', x: 80, y: 80, w: 600, h: 120, rotation: 0, opacity: 1,
    text: 'Text', font: 'Inter, system-ui, sans-serif', fontSize: 64, color: '#ffffff',
    weight: 700, italic: false, align: 'left', lineHeight: 1.15,
    outline: false, outlineColor: '#000000', outlineWidth: 4,
    ...partial,
  };
}
export function makeShape(partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: elementId(), kind: 'shape', x: 100, y: 100, w: 300, h: 200, rotation: 0, opacity: 1,
    shape: 'rect', fill: '#4f46e5', stroke: 'transparent', strokeWidth: 0, radius: 16,
    ...partial,
  };
}
export function makeImage(img: CanvasImageSource, partial: Partial<ImageElement> = {}): ImageElement {
  const iw = (img as any).naturalWidth ?? (img as any).width ?? 400;
  const ih = (img as any).naturalHeight ?? (img as any).height ?? 400;
  return {
    id: elementId(), kind: 'image', x: 100, y: 100, w: iw, h: ih, rotation: 0, opacity: 1,
    img, fit: 'cover',
    ...partial,
  };
}

// ---- Rendering --------------------------------------------------------------

function wrapText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, el: TextElement) {
  ctx.font = `${el.italic ? 'italic ' : ''}${el.weight} ${el.fontSize}px ${el.font}`;
  ctx.textAlign = el.align;
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, el.text, el.w);
  const lh = el.fontSize * el.lineHeight;
  const ax = el.align === 'center' ? el.w / 2 : el.align === 'right' ? el.w : 0;
  ctx.lineJoin = 'round';
  for (let i = 0; i < lines.length; i++) {
    const yy = i * lh;
    if (el.outline && el.outlineWidth > 0) {
      ctx.lineWidth = el.outlineWidth;
      ctx.strokeStyle = el.outlineColor;
      ctx.strokeText(lines[i], ax, yy);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(lines[i], ax, yy);
  }
}

function drawShape(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, el: ShapeElement) {
  ctx.fillStyle = el.fill;
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.strokeWidth;
  if (el.shape === 'rect') {
    if (el.fill !== 'transparent') ctx.fillRect(0, 0, el.w, el.h);
    if (el.strokeWidth > 0) ctx.strokeRect(0, 0, el.w, el.h);
  } else if (el.shape === 'roundedRect') {
    roundRect(ctx, 0, 0, el.w, el.h, el.radius);
    if (el.fill !== 'transparent') ctx.fill();
    if (el.strokeWidth > 0) ctx.stroke();
  } else if (el.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(el.w / 2, el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
    if (el.fill !== 'transparent') ctx.fill();
    if (el.strokeWidth > 0) ctx.stroke();
  } else if (el.shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(0, el.h / 2);
    ctx.lineTo(el.w, el.h / 2);
    ctx.lineWidth = Math.max(1, el.strokeWidth || el.h);
    ctx.strokeStyle = el.stroke !== 'transparent' ? el.stroke : el.fill;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawImageEl(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, el: ImageElement) {
  const sw = (el.img as any).naturalWidth ?? (el.img as any).videoWidth ?? (el.img as any).width ?? 0;
  const sh = (el.img as any).naturalHeight ?? (el.img as any).videoHeight ?? (el.img as any).height ?? 0;
  if (!sw || !sh) { ctx.drawImage(el.img, 0, 0, el.w, el.h); return; }
  if (el.fit === 'fill') { ctx.drawImage(el.img, 0, 0, el.w, el.h); return; }
  const sr = sw / sh, dr = el.w / el.h;
  let tw = el.w, th = el.h, tx = 0, ty = 0;
  const cover = el.fit === 'cover';
  if ((sr > dr) === cover) { tw = el.h * sr; tx = (el.w - tw) / 2; }
  else { th = el.w / sr; ty = (el.h - th) / 2; }
  if (cover) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, el.w, el.h); ctx.clip();
    ctx.drawImage(el.img, tx, ty, tw, th);
    ctx.restore();
  } else {
    ctx.drawImage(el.img, tx, ty, tw, th);
  }
}

/** Draw one element with its transform (position, rotation about center, opacity). */
export function drawElement(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, el: CanvasElement) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, el.opacity));
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  ctx.translate(cx, cy);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-el.w / 2, -el.h / 2);
  if (el.kind === 'text') drawText(ctx, el);
  else if (el.kind === 'shape') drawShape(ctx, el);
  else drawImageEl(ctx, el);
  ctx.restore();
}

/** Render a full element list (bottom-to-top = array order) onto a context. */
export function renderElements(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, elements: CanvasElement[]) {
  for (const el of elements) drawElement(ctx, el);
}

// ---- Hit testing (for the interaction hook) ---------------------------------

/** Transform a point from canvas space into the element's local (unrotated) space. */
export function toLocal(el: BaseElement, px: number, py: number): { lx: number; ly: number } {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const a = (-el.rotation * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a) + el.w / 2;
  const ly = dx * Math.sin(a) + dy * Math.cos(a) + el.h / 2;
  return { lx, ly };
}

export function hitTest(el: BaseElement, px: number, py: number, pad = 0): boolean {
  const { lx, ly } = toLocal(el, px, py);
  return lx >= -pad && lx <= el.w + pad && ly >= -pad && ly <= el.h + pad;
}

/** Top-most element under the point (search from end = top of z-order). */
export function pickElement(elements: CanvasElement[], px: number, py: number): CanvasElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (!elements[i].locked && hitTest(elements[i], px, py, 6)) return elements[i];
  }
  return null;
}
