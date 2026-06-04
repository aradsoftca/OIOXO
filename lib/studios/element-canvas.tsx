'use client';

/**
 * ElementCanvas (CCW C2 + C3) — an editable free-canvas surface with a real
 * transform gizmo: select, drag, 8-handle resize, and rotate. Renders elements
 * via the shared element-model renderer to a <canvas>, draws selection handles
 * in an SVG overlay, and reports edits back through onChange. Used by Slides /
 * Poster / Thumbnail / Meme / Collage so none of them hand-roll dragging again.
 *
 * Pointer events + touch-action:none = works with a finger (mobile fix M5).
 */

import * as React from 'react';
import {
  type CanvasElement, renderElements, pickElement, toLocal,
} from './element-model';

type TextElementLike = CanvasElement & { fontSize: number };

interface Props {
  width: number;            // design-space width
  height: number;           // design-space height
  background?: string;      // CSS background (color or gradient) painted first
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: CanvasElement[], commit: boolean) => void;
  /** Max on-screen width in px; the surface scales to fit and stays 16:9 etc. */
  maxWidth?: number;
  className?: string;
}

type DragMode =
  | { kind: 'move'; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; handle: number; start: CanvasElement }
  | { kind: 'rotate'; cx: number; cy: number; startAngle: number; startRot: number };

const HANDLES = [
  { dx: 0, dy: 0 }, { dx: 0.5, dy: 0 }, { dx: 1, dy: 0 },
  { dx: 1, dy: 0.5 }, { dx: 1, dy: 1 }, { dx: 0.5, dy: 1 },
  { dx: 0, dy: 1 }, { dx: 0, dy: 0.5 },
];

export function ElementCanvas({ width, height, background, elements, selectedId, onSelect, onChange, maxWidth = 960, className }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<DragMode | null>(null);
  const scale = Math.min(1, maxWidth / width);
  const dispW = Math.round(width * scale), dispH = Math.round(height * scale);
  const selected = elements.find(e => e.id === selectedId) ?? null;

  // Paint the canvas whenever elements/background change.
  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = width; c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    if (background) {
      if (background.includes('gradient')) {
        // Let CSS handle gradients via the wrapper; paint white under for export safety.
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
      } else { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    }
    renderElements(ctx, elements);
  }, [elements, background, width, height]);

  const toDesign = (e: React.PointerEvent): { x: number; y: number } => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toDesign(e);
    // Handle / rotate hit-test first (only when something's selected).
    if (selected) {
      const h = handleAt(selected, p.x, p.y, scale);
      if (h === 'rotate') {
        const cx = selected.x + selected.w / 2, cy = selected.y + selected.h / 2;
        drag.current = { kind: 'rotate', cx, cy, startAngle: Math.atan2(p.y - cy, p.x - cx), startRot: selected.rotation };
        return;
      }
      if (h >= 0) { drag.current = { kind: 'resize', handle: h, start: { ...selected } }; return; }
    }
    const hit = pickElement(elements, p.x, p.y);
    onSelect(hit?.id ?? null);
    if (hit) drag.current = { kind: 'move', startX: p.x, startY: p.y, origX: hit.x, origY: hit.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !selected) return;
    const p = toDesign(e);
    const d = drag.current;
    let next = { ...selected } as CanvasElement;
    if (d.kind === 'move') {
      next.x = d.origX + (p.x - d.startX);
      next.y = d.origY + (p.y - d.startY);
    } else if (d.kind === 'rotate') {
      const ang = Math.atan2(p.y - d.cy, p.x - d.cx);
      let deg = d.startRot + ((ang - d.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15; // snap with shift
      next.rotation = Math.round(deg);
    } else {
      // Resize in the element's LOCAL (unrotated) space. The pointer's local
      // coords give the new edge; the opposite edge stays put, so we adjust
      // both size and the box origin. (lx,ly grow right/down from top-left.)
      const { lx, ly } = toLocal(d.start, p.x, p.y);
      const hx = HANDLES[d.handle].dx, hy = HANDLES[d.handle].dy;
      let lx0 = 0, ly0 = 0, lx1 = d.start.w, ly1 = d.start.h; // local box edges
      if (hx === 0) lx0 = Math.min(lx, lx1 - 8);
      else if (hx === 1) lx1 = Math.max(lx, lx0 + 8);
      if (hy === 0) ly0 = Math.min(ly, ly1 - 8);
      else if (hy === 1) ly1 = Math.max(ly, ly0 + 8);
      const nw = lx1 - lx0, nh = ly1 - ly0;
      // The box center moved in local space; map that delta back to canvas space
      // through the rotation so the dragged edge tracks the pointer.
      const oldCx = d.start.w / 2, oldCy = d.start.h / 2;
      const newCx = (lx0 + lx1) / 2, newCy = (ly0 + ly1) / 2;
      const a = (d.start.rotation * Math.PI) / 180;
      const ddx = newCx - oldCx, ddy = newCy - oldCy;
      const worldDx = ddx * Math.cos(a) - ddy * Math.sin(a);
      const worldDy = ddx * Math.sin(a) + ddy * Math.cos(a);
      const startCx = d.start.x + d.start.w / 2, startCy = d.start.y + d.start.h / 2;
      const ncx = startCx + worldDx, ncy = startCy + worldDy;
      next.w = nw; next.h = nh;
      next.x = ncx - nw / 2; next.y = ncy - nh / 2;
      if (next.kind === 'text') (next as TextElementLike).fontSize = Math.max(8, (d.start as TextElementLike).fontSize * (nh / Math.max(1, d.start.h)));
    }
    onChange(elements.map(el => el.id === next.id ? next : el), false);
  };

  const onPointerUp = () => {
    if (drag.current) onChange(elements, true); // commit to undo stack
    drag.current = null;
  };

  return (
    <div className={className} style={{ width: dispW, height: dispH, position: 'relative' }}>
      <div
        ref={wrapRef}
        style={{ width: dispW, height: dispH, position: 'relative', background: background?.includes('gradient') ? background : undefined, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} style={{ width: dispW, height: dispH, display: 'block' }} />
        {selected && (
          <Gizmo el={selected} scale={scale} />
        )}
      </div>
    </div>
  );
}

/** Which handle (0-7) or 'rotate' or -1 is under the design-space point. */
function handleAt(el: CanvasElement, px: number, py: number, scale: number): number | 'rotate' {
  const tol = 12 / scale;
  // rotate handle sits above the top-center, in local space.
  const rot = { lx: el.w / 2, ly: -28 / scale };
  const { lx, ly } = toLocal(el, px, py);
  if (Math.hypot(lx - rot.lx, ly - rot.ly) <= tol) return 'rotate';
  for (let i = 0; i < HANDLES.length; i++) {
    const hx = HANDLES[i].dx * el.w, hy = HANDLES[i].dy * el.h;
    if (Math.hypot(lx - hx, ly - hy) <= tol) return i;
  }
  return -1;
}

function Gizmo({ el, scale }: { el: CanvasElement; scale: number }) {
  const cx = (el.x + el.w / 2) * scale, cy = (el.y + el.h / 2) * scale;
  const w = el.w * scale, h = el.h * scale;
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }} width="100%" height="100%">
      <g transform={`translate(${cx} ${cy}) rotate(${el.rotation}) translate(${-w / 2} ${-h / 2})`}>
        <rect x={0} y={0} width={w} height={h} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 3" />
        {HANDLES.map((hp, i) => (
          <rect key={i} x={hp.dx * w - 5} y={hp.dy * h - 5} width={10} height={10} fill="#fff" stroke="#22d3ee" strokeWidth={1.5} />
        ))}
        <line x1={w / 2} y1={0} x2={w / 2} y2={-28} stroke="#22d3ee" strokeWidth={1.5} />
        <circle cx={w / 2} cy={-28} r={6} fill="#22d3ee" />
      </g>
    </svg>
  );
}
