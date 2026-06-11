'use client';

import * as React from 'react';
import {
  MousePointer2, Hand, ZoomIn, Crop, Brush, Eraser, PaintBucket,
  Type as TypeIcon, Square, Circle as CircleIcon, Pipette,
  Lasso, Wand2, Move, Layers as LayersIcon, History, Sliders,
  Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Trash2, Plus,
  Copy, FolderPlus, Download, Save, Upload, Undo2, Redo2,
  FlipHorizontal2, FlipVertical2, RotateCw, Sparkles, Image as ImageIcon,
  X, Check, AlertTriangle, FileText, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'image-studio';
import {
  StudioShell, StudioTopBar, StudioBody, StudioToolDock, StudioToolButton,
  StudioPanel, StudioSidebar, StudioCanvasArea, StudioStatusBar,
  StudioButton, StudioSlider, StudioDivider, StudioSelect,
  blankCanvas, cloneCanvas, fileToCanvas, adjustToFilter, ZERO_ADJUST,
  type AdjustParams, hexToRgb, rgbToHex,
  convolve3x3, KERNELS, gaussianBlur, buildCurveLut, applyCurves,
  RgbCurvesPanel, applyCurveSet, type CurveSet, IDENTITY_CURVE,
  UndoStack, newProject, saveProject, loadProject, listProjects,
  type StudioProject,
  canvasToBlob, downloadBlob, safeFilename, type ImageFormat,
  useShortcuts, formatCombo,
  removeBackgroundAuto, removeBackgroundByLuma, subjectMask,
  autoEnhance, extractPalette, smartCrop,
  COLOR_GRADES, type ColorGrade,
  useRafThrottle, usePinchPan, useResponsiveStudio, deviceProfile, LayerCompositeCache,
  AnimationPanel, computeElementState, totalAnimationDuration,
  type AnimationConfig,
  applyLayerStyles, layerStylesPad,
  type LayerStyles, type LayerShadow, type LayerGlow, type LayerStroke,
  DEFAULT_SHADOW, DEFAULT_GLOW, DEFAULT_STROKE,
  HelpButton, useRegisterShortcuts,
  EmptyState, pushToast,
  SharedDialog,
  DesktopOnly, MobileOnly,
} from '@/lib/studios';

type ToolKind =
  | 'move' | 'marquee-rect' | 'marquee-ellipse' | 'lasso' | 'wand'
  | 'crop' | 'eyedropper' | 'brush' | 'eraser' | 'bucket'
  | 'clone' | 'heal'
  | 'text' | 'shape-rect' | 'shape-ellipse' | 'hand' | 'zoom';

type BlendMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

const BLEND_LIST: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Dodge' },
  { value: 'color-burn', label: 'Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

/** A non-destructive filter in a layer's effect stack — re-applied at render
 *  time so it can be re-ordered, tweaked, or removed without touching pixels. */
interface LayerFx { id: string; kind: 'blur' | 'sharpen' | 'emboss' | 'edge' | 'pixelate' | 'posterize' | 'noise'; param: number; enabled: boolean }

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  mask?: HTMLCanvasElement;
  adjust: AdjustParams;
  animations?: AnimationConfig;
  styles?: LayerStyles;
  /** Non-destructive effect stack (applied after adjust, before compositing). */
  fx?: LayerFx[];
}

interface ImageLayer extends LayerBase {
  kind: 'image';
  canvas: HTMLCanvasElement;
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number;
}

interface PaintLayer extends LayerBase {
  kind: 'paint';
  canvas: HTMLCanvasElement;
}

interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  x: number; y: number;
  size: number;
  color: string;
  font: string;
  weight: number;
  italic: boolean;
  align: CanvasTextAlign;
  letterSpacing: number;
  lineHeight: number;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowBlur: number;
  shadowColor: string;
}

interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  x: number; y: number; w: number; h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

interface AdjustmentLayer extends LayerBase {
  kind: 'adjust';
  adjustKind: 'bright-contrast' | 'hue-sat' | 'levels' | 'curves' | 'color-balance' | 'invert';
  params: Record<string, number>;
  /** Real per-channel curves (master + R/G/B), arbitrary draggable points.
   *  Preferred over the legacy 5-point composite `params` when present. */
  curveSet?: CurveSet;
}

type Layer = ImageLayer | PaintLayer | TextLayer | ShapeLayer | AdjustmentLayer;

interface DocState {
  name: string;
  width: number;
  height: number;
  background: 'transparent' | string;
  layers: Layer[];
  activeId: string | null;
  selection: SelectionPath | null;
}

interface SelectionPath {
  kind: 'rect' | 'ellipse' | 'lasso' | 'wand' | 'subject';
  mask: HTMLCanvasElement;
}

const NEW_DOC = (w: number, h: number, name = 'Untitled'): DocState => ({
  name, width: w, height: h, background: '#ffffff',
  layers: [{
    id: lid(),
    kind: 'paint',
    name: 'Background',
    canvas: blankCanvas(w, h),
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    adjust: { ...ZERO_ADJUST },
  } as PaintLayer],
  activeId: null,
  selection: null,
});

let _lid = 0;
function lid() { return `L${++_lid}_${Math.random().toString(36).slice(2, 6)}`; }

function cloneLayer(l: Layer): Layer {
  // Layer masks live on LayerBase and were SHARED by reference between undo
  // frames — painting into a mask after pushing to the undo stack would
  // silently mutate the previous frames' masks too, corrupting history. Clone
  // the mask alongside the layer's main canvas so each frame is independent.
  const base = { ...l, adjust: { ...l.adjust }, mask: l.mask ? cloneCanvas(l.mask) : undefined, fx: l.fx ? l.fx.map(f => ({ ...f })) : undefined };
  if (l.kind === 'paint') return { ...base, canvas: cloneCanvas(l.canvas) } as Layer;
  if (l.kind === 'image') return { ...base, canvas: cloneCanvas(l.canvas) } as Layer;
  return base as Layer;
}

function cloneDoc(d: DocState): DocState {
  return {
    ...d,
    layers: d.layers.map(cloneLayer),
    selection: d.selection ? { kind: d.selection.kind, mask: cloneCanvas(d.selection.mask) } : null,
  };
}

/** Apply a layer's non-destructive effect stack to its source canvas (in order,
 *  enabled only). Returns the original if the stack is empty. */
function applyFxStack(src: HTMLCanvasElement, fx?: LayerFx[]): HTMLCanvasElement {
  if (!fx || !fx.length) return src;
  let cur = src;
  for (const f of fx) {
    if (!f.enabled) continue;
    if (f.kind === 'blur') cur = gaussianBlur(cur, f.param);
    else if (f.kind === 'sharpen') cur = applyKernel(cur, KERNELS.sharpen, f.param);
    else if (f.kind === 'emboss') cur = applyKernel(cur, KERNELS.emboss, f.param);
    else if (f.kind === 'edge') cur = applyKernel(cur, KERNELS.edge, f.param);
    else if (f.kind === 'pixelate') cur = pixelate(cur, Math.max(1, f.param));
    else if (f.kind === 'posterize') cur = posterize(cur, Math.max(2, Math.min(16, f.param)));
    else if (f.kind === 'noise') cur = noise(cur, f.param);
  }
  return cur;
}

function renderLayer(layer: Layer, w: number, h: number): HTMLCanvasElement | null {
  if (!layer.visible || layer.opacity <= 0) return null;
  if (layer.kind === 'image') {
    const c = blankCanvas(w, h);
    const ctx = c.getContext('2d')!;
    const srcC = applyFxStack(layer.canvas, layer.fx);
    ctx.save();
    ctx.translate(layer.x + (layer.canvas.width * layer.scaleX) / 2, layer.y + (layer.canvas.height * layer.scaleY) / 2);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.scale(layer.scaleX, layer.scaleY);
    ctx.filter = adjustToFilter(layer.adjust);
    ctx.drawImage(srcC, -layer.canvas.width / 2, -layer.canvas.height / 2);
    ctx.filter = 'none';
    ctx.restore();
    return c;
  }
  if (layer.kind === 'paint') {
    const c = blankCanvas(w, h);
    const ctx = c.getContext('2d')!;
    const srcC = applyFxStack(layer.canvas, layer.fx);
    ctx.filter = adjustToFilter(layer.adjust);
    ctx.drawImage(srcC, 0, 0);
    ctx.filter = 'none';
    return c;
  }
  if (layer.kind === 'text') {
    const c = blankCanvas(w, h);
    const ctx = c.getContext('2d')!;
    const style = `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px ${layer.font}`;
    ctx.font = style;
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'top';
    if (layer.shadow) {
      ctx.shadowBlur = layer.shadowBlur;
      ctx.shadowColor = layer.shadowColor;
    }
    const lines = layer.text.split('\n');
    const lh = layer.size * layer.lineHeight;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const y = layer.y + i * lh;
      if (layer.outline && layer.outlineWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = layer.outlineWidth;
        ctx.strokeStyle = layer.outlineColor;
        if (layer.letterSpacing === 0) ctx.strokeText(ln, layer.x, y);
        else drawSpacedText(ctx, ln, layer.x, y, layer.letterSpacing, true);
      }
      ctx.fillStyle = layer.color;
      if (layer.letterSpacing === 0) ctx.fillText(ln, layer.x, y);
      else drawSpacedText(ctx, ln, layer.x, y, layer.letterSpacing, false);
    }
    ctx.shadowBlur = 0;
    return c;
  }
  if (layer.kind === 'shape') {
    const c = blankCanvas(w, h);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = layer.fill;
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.strokeWidth;
    if (layer.shape === 'rect') {
      if (layer.radius > 0) {
        roundedRect(ctx, layer.x, layer.y, layer.w, layer.h, layer.radius);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else {
        ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
        if (layer.strokeWidth > 0) ctx.strokeRect(layer.x, layer.y, layer.w, layer.h);
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(layer.x + layer.w / 2, layer.y + layer.h / 2, Math.abs(layer.w) / 2, Math.abs(layer.h) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (layer.strokeWidth > 0) ctx.stroke();
    }
    return c;
  }
  return null;
}

function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, stroke: boolean) {
  let cx = x;
  if (ctx.textAlign === 'center' || ctx.textAlign === 'right') {
    let total = 0;
    for (const ch of text) total += ctx.measureText(ch).width + spacing;
    if (ctx.textAlign === 'center') cx -= total / 2;
    else cx -= total;
    ctx.textAlign = 'left';
  }
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cx, y);
    else ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function applyAdjustmentBelow(target: HTMLCanvasElement, adj: AdjustmentLayer): HTMLCanvasElement {
  const w = target.width, h = target.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  if (adj.adjustKind === 'invert') {
    ctx.filter = 'invert(100%)';
    ctx.drawImage(target, 0, 0);
    ctx.filter = 'none';
    return out;
  }
  if (adj.adjustKind === 'bright-contrast') {
    const b = adj.params.brightness ?? 100;
    const c = adj.params.contrast ?? 100;
    ctx.filter = `brightness(${b}%) contrast(${c}%)`;
    ctx.drawImage(target, 0, 0);
    ctx.filter = 'none';
    return out;
  }
  if (adj.adjustKind === 'hue-sat') {
    const hue = adj.params.hue ?? 0;
    const sat = adj.params.saturate ?? 100;
    const light = adj.params.lightness ?? 100;
    ctx.filter = `hue-rotate(${hue}deg) saturate(${sat}%) brightness(${light}%)`;
    ctx.drawImage(target, 0, 0);
    ctx.filter = 'none';
    return out;
  }
  if (adj.adjustKind === 'levels') {
    ctx.drawImage(target, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const blackIn = adj.params.blackIn ?? 0;
    const whiteIn = adj.params.whiteIn ?? 255;
    const gamma = adj.params.gamma ?? 1;
    const blackOut = adj.params.blackOut ?? 0;
    const whiteOut = adj.params.whiteOut ?? 255;
    const range = Math.max(1, whiteIn - blackIn);
    const outRange = whiteOut - blackOut;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = (i - blackIn) / range;
      v = Math.max(0, Math.min(1, v));
      v = Math.pow(v, 1 / gamma);
      lut[i] = Math.max(0, Math.min(255, blackOut + v * outRange));
    }
    applyCurves(img.data, lut);
    ctx.putImageData(img, 0, 0);
    return out;
  }
  if (adj.adjustKind === 'curves') {
    ctx.drawImage(target, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    if (adj.curveSet) {
      // Real per-channel curves (master + R/G/B) via the shared engine the
      // Video Studio uses. Arbitrary draggable points, not 5 fixed sliders.
      applyCurveSet(img.data, adj.curveSet);
    } else {
      // Legacy composite 5-point curve (old saved docs).
      const pts = [
        { x: 0, y: adj.params.p0 ?? 0 },
        { x: 64, y: adj.params.p1 ?? 64 },
        { x: 128, y: adj.params.p2 ?? 128 },
        { x: 192, y: adj.params.p3 ?? 192 },
        { x: 255, y: adj.params.p4 ?? 255 },
      ];
      applyCurves(img.data, buildCurveLut(pts));
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }
  if (adj.adjustKind === 'color-balance') {
    ctx.drawImage(target, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const r = (adj.params.r ?? 0);
    const g = (adj.params.g ?? 0);
    const b = (adj.params.b ?? 0);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.max(0, Math.min(255, img.data[i] + r));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + g));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + b));
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }
  ctx.drawImage(target, 0, 0);
  return out;
}

function compositeDoc(doc: DocState): HTMLCanvasElement {
  const out = blankCanvas(doc.width, doc.height);
  const ctx = out.getContext('2d')!;
  if (doc.background !== 'transparent') {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of doc.layers) {
    if (layer.kind === 'adjust') {
      if (!layer.visible || layer.opacity <= 0) continue;
      // Snapshot everything below, compute the adjusted version, then composite
      // it BACK over the original honoring opacity + blend + mask. The old code
      // cleared the canvas and drew the adjusted snapshot at globalAlpha, which
      // (a) made opacity fade the whole image toward transparent instead of
      // mixing adjusted↔original, and (b) ignored blend AND mask entirely — so
      // a masked/partial-strength adjustment layer was a lie.
      const snap = blankCanvas(doc.width, doc.height);
      snap.getContext('2d')!.drawImage(out, 0, 0);
      let adjusted = applyAdjustmentBelow(snap, layer);
      if (layer.mask) {
        // Confine the adjustment to the painted mask region.
        const tmp = blankCanvas(doc.width, doc.height);
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(adjusted, 0, 0);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(layer.mask, 0, 0, doc.width, doc.height);
        adjusted = tmp;
      }
      ctx.globalAlpha = layer.opacity;       // opacity = adjusted/original mix
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(adjusted, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    const rendered = renderLayer(layer, doc.width, doc.height);
    if (!rendered) continue;
    if (layer.mask) {
      const tmp = blankCanvas(doc.width, doc.height);
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(rendered, 0, 0);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(layer.mask, 0, 0, doc.width, doc.height);
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(rendered, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

function getCanvasOf(layer: Layer): HTMLCanvasElement | null {
  if (layer.kind === 'paint' || layer.kind === 'image') return layer.canvas;
  return null;
}

function magicWand(src: HTMLCanvasElement, sx: number, sy: number, tolerance: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const mask = blankCanvas(w, h);
  const mctx = mask.getContext('2d')!;
  const mi = mctx.createImageData(w, h);
  const seen = new Uint8Array(w * h);
  const xi = Math.max(0, Math.min(w - 1, Math.floor(sx)));
  const yi = Math.max(0, Math.min(h - 1, Math.floor(sy)));
  const start = (yi * w + xi) * 4;
  const tr = data[start], tg = data[start + 1], tb = data[start + 2];
  const stack: number[] = [xi, yi];
  const tol2 = tolerance * tolerance * 3;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const k = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || seen[k]) continue;
    const o = k * 4;
    const dr = data[o] - tr, dg = data[o + 1] - tg, db = data[o + 2] - tb;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    seen[k] = 1;
    mi.data[o] = 255; mi.data[o + 1] = 255; mi.data[o + 2] = 255; mi.data[o + 3] = 255;
    stack.push(x + 1, y); stack.push(x - 1, y);
    stack.push(x, y + 1); stack.push(x, y - 1);
  }
  mctx.putImageData(mi, 0, 0);
  return mask;
}

function lassoMask(w: number, h: number, points: { x: number; y: number }[]): HTMLCanvasElement {
  const c = blankCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (points.length) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

function rectMask(w: number, h: number, x: number, y: number, rw: number, rh: number, ellipse = false): HTMLCanvasElement {
  const c = blankCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  if (ellipse) {
    ctx.beginPath();
    ctx.ellipse(x + rw / 2, y + rh / 2, Math.abs(rw) / 2, Math.abs(rh) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, rw, rh);
  }
  return c;
}

const TOOLS: { tool: ToolKind; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: 'move', label: 'Move', key: 'v', icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: 'marquee-rect', label: 'Rectangle Marquee', key: 'm', icon: <Square className="h-4 w-4" /> },
  { tool: 'marquee-ellipse', label: 'Ellipse Marquee', key: 'shift+m', icon: <CircleIcon className="h-4 w-4" /> },
  { tool: 'lasso', label: 'Lasso', key: 'l', icon: <Lasso className="h-4 w-4" /> },
  { tool: 'wand', label: 'Magic Wand', key: 'w', icon: <Wand2 className="h-4 w-4" /> },
  { tool: 'crop', label: 'Crop', key: 'c', icon: <Crop className="h-4 w-4" /> },
  { tool: 'eyedropper', label: 'Eyedropper', key: 'i', icon: <Pipette className="h-4 w-4" /> },
  { tool: 'brush', label: 'Brush', key: 'b', icon: <Brush className="h-4 w-4" /> },
  { tool: 'eraser', label: 'Eraser', key: 'e', icon: <Eraser className="h-4 w-4" /> },
  { tool: 'clone', label: 'Clone Stamp (alt-click to set source)', key: 's', icon: <Copy className="h-4 w-4" /> },
  { tool: 'heal', label: 'Healing Brush (alt-click to set source)', key: 'j', icon: <Sparkles className="h-4 w-4" /> },
  { tool: 'bucket', label: 'Paint Bucket', key: 'g', icon: <PaintBucket className="h-4 w-4" /> },
  { tool: 'text', label: 'Text', key: 't', icon: <TypeIcon className="h-4 w-4" /> },
  { tool: 'shape-rect', label: 'Rectangle', key: 'u', icon: <Square className="h-4 w-4" /> },
  { tool: 'shape-ellipse', label: 'Ellipse', key: 'shift+u', icon: <CircleIcon className="h-4 w-4" /> },
  { tool: 'hand', label: 'Hand', key: 'h', icon: <Hand className="h-4 w-4" /> },
  { tool: 'zoom', label: 'Zoom', key: 'z', icon: <ZoomIn className="h-4 w-4" /> },
];

const FONTS = [
  'system-ui, sans-serif', 'Georgia, serif', 'Times New Roman, serif',
  'Courier New, monospace', 'Impact, sans-serif', 'Comic Sans MS, cursive',
  'Trebuchet MS, sans-serif', 'Arial Black, sans-serif',
];

export default function ImageStudioPro() {
  const { guard, gate } = useUsageGate('image');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC(1280, 800, 'Untitled'));
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  // Undo/redo/jump restore a layer's CANVAS PIXELS to an earlier state, but the
  // composite cache is keyed by (layerId, hash) where the hash captures props
  // (opacity/adjust/transform/rev) — NOT the pixel content. After an undo the
  // reverted pixels can collide with a still-cached post-edit composite, so the
  // canvas showed the OLD pixels while the doc state was reverted — the "hybrid
  // state" the audit hit. Clearing the cache forces a clean re-render from the
  // restored canvases.
  const undo = () => {
    const prev = stack.current.undo(cloneDoc(doc));
    if (prev) { cacheRef.current.clear(); setDoc(prev); force(); }
  };
  const redo = () => {
    const next = stack.current.redo();
    if (next) { cacheRef.current.clear(); setDoc(next); force(); }
  };
  const jumpHistory = (index: number) => {
    const target = stack.current.jumpTo(index, cloneDoc(doc));
    if (target) { cacheRef.current.clear(); setDoc(target); force(); }
  };

  const [tool, setTool] = React.useState<ToolKind>('move');
  const [fgColor, setFgColor] = React.useState('#111111');
  const [bgColor, setBgColor] = React.useState('#ffffff');
  // When set, the brush/eraser paint into this layer's MASK (white = reveal,
  // black = hide) instead of its pixels — non-destructive masking.
  const [maskEditId, setMaskEditId] = React.useState<string | null>(null);
  const [brushSize, setBrushSize] = React.useState(24);
  const [brushHard, setBrushHard] = React.useState(80);
  const [brushOpacity, setBrushOpacity] = React.useState(100);
  const [brushFlow, setBrushFlow] = React.useState(100);
  const [eraserSize, setEraserSize] = React.useState(40);
  const [wandTol, setWandTol] = React.useState(32);
  const [textSettings, setTextSettings] = React.useState({
    font: FONTS[0], size: 64, color: '#111111', weight: 700, italic: false,
    align: 'left' as CanvasTextAlign, letterSpacing: 0, lineHeight: 1.2,
    outline: false, outlineColor: '#ffffff', outlineWidth: 2,
    shadow: false, shadowBlur: 8, shadowColor: 'rgba(0,0,0,.4)',
  });
  const [shapeSettings, setShapeSettings] = React.useState({
    fill: '#111111', stroke: '#ffffff', strokeWidth: 0, radius: 0,
  });

  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [showRulers, setShowRulers] = React.useState(true);
  const [showGrid, setShowGrid] = React.useState(false);
  const [showLayersPanel, setShowLayersPanel] = React.useState(true);
  const [showHistoryPanel, setShowHistoryPanel] = React.useState(false);
  const [showAdjustPanel, setShowAdjustPanel] = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const scheduleBrushRedraw = useRafThrottle(() => setDoc(d => ({ ...d })));
  const [busy, setBusy] = React.useState<string>('');
  const [toast, setToast] = React.useState<string>('');
  const [filterDialog, setFilterDialog] = React.useState<null | 'blur' | 'sharpen' | 'noise' | 'pixelate' | 'posterize' | 'emboss' | 'edge'>(null);
  const [filterParam, setFilterParam] = React.useState(10);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [exportFmt, setExportFmt] = React.useState<ImageFormat>('png');
  const [exportQ, setExportQ] = React.useState(92);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [newDialog, setNewDialog] = React.useState(false);
  const [resizeDialog, setResizeDialog] = React.useState(false);
  const [textEditOpen, setTextEditOpen] = React.useState<string | null>(null);
  const [transformActive, setTransformActive] = React.useState(false);
  const [animationPlay, setAnimationPlay] = React.useState(false);
  const [animationTime, setAnimationTime] = React.useState(0);
  const [welcomed, setWelcomed] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setWelcomed(sessionStorage.getItem('image-studio-welcomed') === '1');
  }, []);
  const dismissWelcome = React.useCallback(() => {
    setWelcomed(true);
    try { sessionStorage.setItem('image-studio-welcomed', '1'); } catch {}
  }, []);

  React.useEffect(() => {
    if (!animationPlay) return;
    const start = performance.now() / 1000;
    let raf = 0;
    const tick = () => {
      const t = performance.now() / 1000 - start;
      const maxDur = Math.max(...doc.layers.map(l => l.animations ? totalAnimationDuration(l.animations) + 1 : 0), 4);
      const wrapped = t % maxDur;
      setAnimationTime(wrapped);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animationPlay, doc.layers]);

  const toastFor = (msg: string) => { pushToast(msg); };

  const cacheRef = React.useRef(new LayerCompositeCache(48));
  const device = React.useRef(deviceProfile());
  const layerRevisionsRef = React.useRef(new Map<string, number>());
  const bumpRevision = React.useCallback((id: string) => {
    const cur = layerRevisionsRef.current.get(id) ?? 0;
    layerRevisionsRef.current.set(id, cur + 1);
    cacheRef.current.invalidate(id);
  }, []);

  const composite = React.useMemo(() => {
    const out = blankCanvas(doc.width, doc.height);
    const ctx = out.getContext('2d')!;
    if (doc.background !== 'transparent') { ctx.fillStyle = doc.background; ctx.fillRect(0, 0, doc.width, doc.height); }
    for (const layer of doc.layers) {
      if (layer.kind === 'adjust') {
        if (!layer.visible || layer.opacity <= 0) continue;
        // Mirror compositeDoc: composite the adjusted-below back over the
        // original with opacity (adjusted↔original mix) + blend + mask, instead
        // of clearing and drawing the adjusted snapshot at globalAlpha.
        const snap = blankCanvas(doc.width, doc.height);
        snap.getContext('2d')!.drawImage(out, 0, 0);
        let adjusted = applyAdjustmentBelow(snap, layer);
        if (layer.mask) {
          const tmp = blankCanvas(doc.width, doc.height);
          const tctx = tmp.getContext('2d')!;
          tctx.drawImage(adjusted, 0, 0);
          tctx.globalCompositeOperation = 'destination-in';
          tctx.drawImage(layer.mask, 0, 0, doc.width, doc.height);
          adjusted = tmp;
        }
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend;
        ctx.drawImage(adjusted, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      const rev = layerRevisionsRef.current.get(layer.id) ?? 0;
      const hash = `${rev}_${layer.opacity}_${layer.blend}_${layer.visible}_${JSON.stringify(layer.adjust)}_${(layer as any).x ?? 0}_${(layer as any).y ?? 0}_${(layer as any).rotation ?? 0}_${(layer as any).scaleX ?? 1}_${(layer as any).scaleY ?? 1}_${(layer as any).text ?? ''}_${(layer as any).w ?? 0}_${(layer as any).h ?? 0}_${(layer as any).fill ?? ''}_${JSON.stringify(layer.styles ?? null)}_${JSON.stringify(layer.fx ?? null)}`;
      let rendered = cacheRef.current.get(layer.id, hash);
      if (!rendered) {
        rendered = renderLayer(layer, doc.width, doc.height);
        if (rendered && layer.styles) {
          const styled = applyLayerStyles(rendered, layer.styles);
          if (styled !== rendered) {
            const pad = layerStylesPad(layer.styles);
            const fitted = blankCanvas(doc.width, doc.height);
            const fctx = fitted.getContext('2d')!;
            fctx.drawImage(styled, -pad, -pad);
            rendered = fitted;
          }
        }
        if (rendered) cacheRef.current.set(layer.id, hash, rendered);
      }
      if (!rendered) continue;
      if (!layer.visible || layer.opacity <= 0) continue;
      if (layer.mask) {
        const tmp = blankCanvas(doc.width, doc.height);
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(rendered, 0, 0);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(layer.mask, 0, 0, doc.width, doc.height);
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend;
        ctx.drawImage(tmp, 0, 0);
      } else {
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend;
        ctx.drawImage(rendered, 0, 0);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return out;
  }, [doc]);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = doc.width;
    c.height = doc.height;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    if (animationPlay) {
      const frame = { w: doc.width, h: doc.height };
      const maxDur = Math.max(...doc.layers.map(l => l.animations ? totalAnimationDuration(l.animations) + 1 : 0), 4);
      if (doc.background !== 'transparent') {
        ctx.fillStyle = doc.background;
        ctx.fillRect(0, 0, doc.width, doc.height);
      }
      for (const layer of doc.layers) {
        if (!layer.visible) continue;
        const state = computeElementState(layer.animations, animationTime, maxDur, frame);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity * state.opacity));
        ctx.translate(doc.width / 2 + state.translateX, doc.height / 2 + state.translateY);
        ctx.rotate((state.rotate * Math.PI) / 180);
        ctx.scale(state.scale, state.scale);
        ctx.translate(-doc.width / 2, -doc.height / 2);
        const rendered = renderLayer({ ...layer, opacity: 1, visible: true } as Layer, doc.width, doc.height);
        if (rendered) ctx.drawImage(rendered, 0, 0);
        ctx.restore();
      }
    } else {
      ctx.drawImage(composite, 0, 0);
      if (doc.selection) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(doc.selection.mask, 0, 0);
        ctx.restore();
      }
    }
  }, [composite, doc.selection, animationPlay, animationTime]);

  // Latest doc dimensions in a ref so fitToScreen is never a stale closure —
  // callers stash it in requestAnimationFrame right after commit(), and the
  // closure captured the PRE-commit width/height (new 1920×1080 doc kept the
  // old doc's fit → canvas clipped under the right panel).
  const docDimsRef = React.useRef({ w: doc.width, h: doc.height });
  docDimsRef.current.w = doc.width;
  docDimsRef.current.h = doc.height;

  const fitToScreen = React.useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pad = 60;
    const { w, h } = docDimsRef.current;
    const sx = (wrap.clientWidth - pad) / w;
    const sy = (wrap.clientHeight - pad) / h;
    const z = Math.min(sx, sy, 4);
    setZoom(Math.max(0.05, z));
    setPan({ x: (wrap.clientWidth - w * z) / 2, y: (wrap.clientHeight - h * z) / 2 });
  }, []);

  React.useEffect(() => { fitToScreen(); }, [fitToScreen, doc.width, doc.height]);

  // Re-fit when the viewport/container actually changes size (window resize,
  // device rotation, panel slide-in/out). Without this the canvas keeps the pan
  // computed for the old size and can end up scrolled fully off-screen on mobile.
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let last = { w: wrap.clientWidth, h: wrap.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w === last.w && h === last.h) return;
      last = { w, h };
      fitToScreen();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fitToScreen]);

  usePinchPan({ ref: wrapRef, zoom, pan, setZoom, setPan, minZoom: 0.05, maxZoom: 16 });

  const activeLayer = doc.layers.find(l => l.id === doc.activeId) ?? null;

  const updateLayer = (id: string, mut: (l: Layer) => Layer | void, label = 'edit layer') => {
    const next = cloneDoc(doc);
    const idx = next.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const result = mut(next.layers[idx]);
    if (result) next.layers[idx] = result;
    commit(label, next);
  };

  const addLayer = (l: Layer, label = 'add layer') => {
    const next = cloneDoc(doc);
    next.layers.push(l);
    next.activeId = l.id;
    commit(label, next);
  };

  const removeLayer = (id: string) => {
    if (doc.layers.length <= 1) { toastFor('Need at least one layer'); return; }
    const next = cloneDoc(doc);
    next.layers = next.layers.filter(l => l.id !== id);
    if (next.activeId === id) next.activeId = next.layers[next.layers.length - 1]?.id ?? null;
    commit('delete layer', next);
  };

  const duplicateLayer = (id: string) => {
    const layer = doc.layers.find(l => l.id === id);
    if (!layer) return;
    const copy = cloneLayer(layer);
    copy.id = lid();
    copy.name = `${layer.name} copy`;
    const next = cloneDoc(doc);
    const idx = next.layers.findIndex(l => l.id === id);
    next.layers.splice(idx + 1, 0, copy);
    next.activeId = copy.id;
    commit('duplicate', next);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    const next = cloneDoc(doc);
    const idx = next.layers.findIndex(l => l.id === id);
    const ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= next.layers.length) return;
    const [l] = next.layers.splice(idx, 1);
    next.layers.splice(ni, 0, l);
    commit('reorder', next);
  };

  const setActive = (id: string) => {
    setDoc(d => ({ ...d, activeId: id }));
  };

  const newPaintLayer = (name = 'Paint'): PaintLayer => ({
    id: lid(), kind: 'paint', name,
    canvas: blankCanvas(doc.width, doc.height),
    visible: true, locked: false, opacity: 1,
    blend: 'source-over', adjust: { ...ZERO_ADJUST },
  });

  const ensurePaintLayer = (): PaintLayer => {
    let layer = activeLayer;
    if (!layer || layer.kind === 'adjust' || layer.kind === 'text' || layer.kind === 'shape' || layer.locked) {
      const p = newPaintLayer('Paint');
      addLayer(p, 'new paint');
      return p;
    }
    if (layer.kind === 'image') {
      const p = newPaintLayer('Paint');
      addLayer(p, 'new paint');
      return p;
    }
    return layer;
  };

  const openImageFiles = async (files: FileList | File[]) => {
    // Opening images is FREE — like Photopea/Canva you load and edit without
    // spending anything; the credit is charged on Export and on the heavy AI
    // ops (remove-bg / remove-object). Gating import burned a free user's daily
    // image credit just to open a photo, and blocked the editor entirely when
    // the usage API was unreachable.
    const arr = Array.from(files);
    if (!arr.length) return;
    setRecovery(null); // opening a real file supersedes the recover-last-session offer
    setBusy('Loading images…');
    try {
      const next = cloneDoc(doc);
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const c = await fileToCanvas(f);
        // First image opened into a PRISTINE default doc → the document adopts
        // the image's dimensions (like Photopea/Canva: "open photo" gives you a
        // canvas the size of that photo, not the image pasted into a mismatched
        // default canvas). Pristine = exactly one untouched, fully-transparent
        // paint layer (the blank 'Background'). The white `background` color
        // doesn't disqualify it — that's just the default doc's paper color.
        if (i === 0 && next.layers.length === 1 && next.layers[0].kind === 'paint') {
          const bgC = next.layers[0].canvas;
          const ctx = bgC.getContext('2d')!;
          // Sample a few points; an unedited blank layer is transparent everywhere.
          const pts = [[0, 0], [bgC.width - 1, 0], [0, bgC.height - 1], [(bgC.width / 2) | 0, (bgC.height / 2) | 0]];
          const untouched = pts.every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] === 0);
          if (untouched) {
            next.width = c.width;
            next.height = c.height;
            next.layers = [];
          }
        }
        if (next.layers.length === 0) {
          next.width = c.width;
          next.height = c.height;
        }
        const layer: ImageLayer = {
          id: lid(), kind: 'image', name: f.name.replace(/\.[^.]+$/, ''),
          canvas: c, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
          visible: true, locked: false, opacity: 1,
          blend: 'source-over', adjust: { ...ZERO_ADJUST },
        };
        next.layers.push(layer);
        next.activeId = layer.id;
      }
      commit('open image', next);
      // Content is now on the canvas — get the welcome overlay out of the way so
      // the user actually SEES their image instead of the onboarding card.
      dismissWelcome();
      requestAnimationFrame(fitToScreen);
    } finally {
      setBusy('');
    }
  };

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length) await openImageFiles(files);
    };
    const onDrag = (e: DragEvent) => { e.preventDefault(); };
    // Photopea-parity: paste an image straight from the clipboard (Ctrl+V) — a
    // table-stakes import path (screenshot → paste). Ignored while typing in a
    // text field. Adds the pasted image as a new layer (handled by openImageFiles).
    const onPaste = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) imgs.push(f); }
      }
      if (imgs.length) {
        e.preventDefault();
        const dt = new DataTransfer();
        imgs.forEach(f => dt.items.add(f));
        await openImageFiles(dt.files);
        toastFor('Pasted from clipboard');
      }
    };
    wrap.addEventListener('drop', onDrop);
    wrap.addEventListener('dragover', onDrag);
    window.addEventListener('paste', onPaste);
    return () => {
      wrap.removeEventListener('drop', onDrop);
      wrap.removeEventListener('dragover', onDrag);
      window.removeEventListener('paste', onPaste);
    };
  });

  const startNew = (w: number, h: number, name: string, bg: 'transparent' | string) => {
    // Committing to a fresh document makes the "recover your last session" offer
    // moot — clear it so the banner doesn't linger over the new workspace.
    setRecovery(null);
    const next = NEW_DOC(w, h, name);
    next.background = bg;
    const bgLayer = next.layers[0] as PaintLayer;
    if (bg === 'transparent') {
      bgLayer.canvas = blankCanvas(w, h);
    } else {
      const ctx = bgLayer.canvas.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    next.activeId = bgLayer.id;
    commit('new doc', next);
    requestAnimationFrame(fitToScreen);
  };

  // Layered PSD export — each studio layer becomes a real Photoshop layer
  // (name, opacity, visibility) so the comp can be handed to Photoshop/Affinity,
  // not just a flattened raster. Rendered via the same renderLayer the canvas uses.
  const exportPsd = async () => {
    const layerHit = checkLever(POLICY_KEY, 'layers', doc.layers.length, isPro);
    if (layerHit) { policyGate.fire(layerHit); return; }
    if (!(await guard())) return;
    setBusy('Building PSD…');
    try {
      const { writePsd } = await import('ag-psd');
      const psdLayers = doc.layers.map((layer) => {
        const c = renderLayer(layer, doc.width, doc.height) ?? blankCanvas(doc.width, doc.height);
        return { name: layer.name, canvas: c, opacity: Math.round((layer.opacity ?? 1) * 255), hidden: !layer.visible };
      });
      const psd = { width: doc.width, height: doc.height, children: psdLayers, canvas: composite };
      const buffer = writePsd(psd as any);
      downloadBlob(new Blob([buffer], { type: 'image/vnd.adobe.photoshop' }), `${safeFilename(doc.name)}.psd`);
      toastFor('Exported layered PSD');
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'PSD export failed');
    } finally { setBusy(''); }
  };

  const exportImage = async () => {
    const sizeMax = Math.max(doc.width, doc.height);
    const resHit = checkLever(POLICY_KEY, 'output-resolution', sizeMax, isPro);
    if (resHit) { policyGate.fire(resHit); return; }
    const layerHit = checkLever(POLICY_KEY, 'layers', doc.layers.length, isPro);
    if (layerHit) { policyGate.fire(layerHit); return; }
    const fmtHit = checkFormat(POLICY_KEY, exportFmt, isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    setBusy('Exporting…');
    try {
      const blob = await canvasToBlob(composite, exportFmt, exportQ / 100);
      downloadBlob(blob, `${safeFilename(doc.name)}.${exportFmt}`);
      toastFor('Exported');
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const snapshot: DocState = {
        ...doc,
        layers: doc.layers.map(l => {
          if (l.kind === 'paint' || l.kind === 'image') {
            return { ...l, canvas: cloneCanvas(l.canvas) } as Layer;
          }
          return { ...l };
        }),
      };
      const proj = newProject('image', doc.name, serializeDoc(snapshot));
      await saveProject(proj);
      toastFor('Saved to library');
    } finally {
      setBusy('');
    }
  };

  // ── Autosave + crash recovery ──────────────────────────────────────────────
  // Photopea's cardinal sin is losing unsaved work to an ad-crash/refresh. We
  // weaponize that: the working doc is silently persisted to a dedicated
  // recovery slot ~2s after the last edit, and on next load we offer to restore.
  // Serialized snapshots are stored in IndexedDB (via the same serializeDoc the
  // library uses) under a fixed key so a refresh/crash never loses the canvas.
  const RECOVERY_KEY = 'xonvert.image-studio.recovery';
  React.useEffect(() => {
    // Only autosave a doc that actually has content (skip the empty default).
    const hasContent = doc.layers.some(l => (l.kind === 'image' || l.kind === 'paint'));
    if (!hasContent) return;
    const id = window.setTimeout(() => {
      try {
        const snap: DocState = { ...doc, layers: doc.layers.map(l => (l.kind === 'paint' || l.kind === 'image') ? ({ ...l, canvas: cloneCanvas(l.canvas) } as Layer) : { ...l }) };
        const payload = JSON.stringify({ at: Date.now(), name: doc.name, data: serializeDoc(snap) });
        // localStorage caps ~5MB; for larger canvases fall back to IndexedDB via
        // the project store (a single recovery project, overwritten each time).
        if (payload.length < 4_000_000) { try { localStorage.setItem(RECOVERY_KEY, payload); } catch { /* quota → ignore */ } }
        else { void saveProject(newProject('image', '__recovery__', serializeDoc(snap))); }
      } catch { /* never let autosave throw into the editor */ }
    }, 2000);
    return () => window.clearTimeout(id);
  }, [doc]);

  // Offer recovery once, on first mount, if a recent snapshot exists and we're on
  // the empty default doc (don't clobber a doc the user just opened).
  const recoveryChecked = React.useRef(false);
  React.useEffect(() => {
    if (recoveryChecked.current) return;
    recoveryChecked.current = true;
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const { at, name, data } = JSON.parse(raw);
      // Only offer if it's reasonably fresh (last 7 days) and we haven't loaded a doc.
      if (Date.now() - at > 7 * 864e5) { localStorage.removeItem(RECOVERY_KEY); return; }
      setRecovery({ at, name, data });
    } catch { /* ignore corrupt recovery */ }
  }, []);
  const [recovery, setRecovery] = React.useState<{ at: number; name: string; data: SerializedDoc } | null>(null);
  const doRecover = async () => {
    if (!recovery) return;
    setBusy('Recovering…');
    try {
      const restored = await deserializeDoc(recovery.data);
      setDoc(restored);
      stack.current.reset(cloneDoc(restored), 'recover');
      force();
      requestAnimationFrame(fitToScreen);
      toastFor('Recovered your last session');
    } catch { toastFor('Could not recover'); }
    finally { setBusy(''); setRecovery(null); }
  };
  const dismissRecovery = () => { try { localStorage.removeItem(RECOVERY_KEY); } catch {} setRecovery(null); };

  const openSaved = async () => {
    const list = await listProjects('image');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<SerializedDoc>(id);
      if (!p) return;
      const restored = await deserializeDoc(p.state);
      setDoc(restored);
      stack.current.reset(cloneDoc(restored), 'open');
      force();
      setOpenDialog(false);
      requestAnimationFrame(fitToScreen);
    } finally {
      setBusy('');
    }
  };

  const runFilter = (kind: 'blur' | 'sharpen' | 'noise' | 'pixelate' | 'posterize' | 'emboss' | 'edge', param: number) => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) {
      toastFor('Pick a paint or image layer');
      return;
    }
    // Non-destructive: append to the layer's effect stack (re-applied at render
    // time, re-orderable/removable) instead of baking pixels.
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === target.id);
    if (l) {
      l.fx = [...(l.fx ?? []), { id: `fx${Date.now().toString(36)}`, kind, param, enabled: true }];
      bumpRevision(l.id);
    }
    commit(`filter: ${kind}`, next);
    setFilterDialog(null);
  };

  const [smartCropDialog, setSmartCropDialog] = React.useState(false);
  const [paletteDialog, setPaletteDialog] = React.useState<string[] | null>(null);

  const runAutoEnhance = async () => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) { toastFor('Pick an image or paint layer'); return; }
    setBusy('Enhancing…');
    try {
      const src = getCanvasOf(target)!;
      const { canvas: result, magnitude } = autoEnhance(src);
      const next = cloneDoc(doc);
      const idx = next.layers.findIndex(l => l.id === target.id);
      if (idx >= 0) {
        const l = next.layers[idx];
        if (l.kind === 'paint' || l.kind === 'image') (l as PaintLayer | ImageLayer).canvas = result;
      }
      commit('auto enhance', next);
      // Be honest about no-ops: a near-perfect photo gets a near-identity result,
      // so don't claim a big "Enhanced!" win the user can't see.
      if (magnitude < 0.04) toastFor('Already well-balanced — applied a light touch-up');
      else toastFor('Enhanced ✓');
    } finally { setBusy(''); }
  };

  const runExtractPalette = async () => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) { toastFor('Pick an image or paint layer'); return; }
    setBusy('Extracting palette…');
    try {
      const colors = extractPalette(getCanvasOf(target)!, 6);
      setPaletteDialog(colors);
    } finally { setBusy(''); }
  };

  const applyColorGrade = (gradeId: string) => {
    const grade = COLOR_GRADES.find(g => g.id === gradeId);
    if (!grade) return;
    const target = activeLayer;
    if (!target || (target.kind !== 'image' && target.kind !== 'paint')) {
      toastFor('Pick an image or paint layer');
      return;
    }
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === target.id);
    if (!l) return;
    l.adjust.brightness = grade.brightness;
    l.adjust.contrast = grade.contrast;
    l.adjust.saturate = grade.saturation;
    l.adjust.hue = grade.hue;
    commit(`grade: ${grade.name}`, next);
    toastFor(grade.name);
  };

  const runSmartCrop = (aw: number, ah: number) => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) { toastFor('Pick an image or paint layer'); return; }
    setBusy('Smart cropping…');
    try {
      const result = smartCrop(getCanvasOf(target)!, aw, ah);
      const next = cloneDoc(doc);
      const idx = next.layers.findIndex(l => l.id === target.id);
      if (idx >= 0) {
        const l = next.layers[idx];
        if (l.kind === 'paint' || l.kind === 'image') (l as PaintLayer | ImageLayer).canvas = result;
      }
      next.width = result.width;
      next.height = result.height;
      commit('smart crop', next);
      requestAnimationFrame(fitToScreen);
      toastFor('Cropped');
      setSmartCropDialog(false);
    } finally { setBusy(''); }
  };

  const runRemoveBg = async () => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) {
      toastFor('Pick an image or paint layer first');
      return;
    }
    if (!(await guard())) return;
    setBusy('Loading model…');
    try {
      const src = getCanvasOf(target)!;
      let result: HTMLCanvasElement;
      try {
        result = await removeBackgroundAuto(src, (p, r) => { setBusy(p); });
      } catch {
        setBusy('Using fast removal…');
        result = await removeBackgroundByLuma(src, 36);
      }
      const next = cloneDoc(doc);
      const idx = next.layers.findIndex(l => l.id === target.id);
      if (idx >= 0) {
        const l = next.layers[idx];
        if (l.kind === 'paint' || l.kind === 'image') (l as PaintLayer | ImageLayer).canvas = result;
      }
      next.background = 'transparent';
      commit('remove background', next);
      toastFor('Background removed');
    } catch (e) {
      toastFor((e as Error).message || 'Could not remove background');
    } finally {
      setBusy('');
    }
  };

  // Object-aware "Select Subject" (the Photoshop one-click move): segment the
  // active image and turn the subject's shape into the active selection — no
  // tracing, no color magic-wand fiddling. Falls back to a hint if there's no
  // clear subject. Selecting is FREE (no usage credit — it's not an output).
  const runSelectSubject = async () => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) {
      toastFor('Pick an image or paint layer first');
      return;
    }
    setBusy('Loading model…');
    try {
      const src = getCanvasOf(target)!;
      const mask = await subjectMask(src, (p) => setBusy(p));
      if (!mask) { toastFor('No clear subject found — try the magic wand'); return; }
      const next = cloneDoc(doc);
      next.selection = { kind: 'subject', mask };
      commit('select subject', next);
      toastFor('Subject selected — adjust, mask, or delete the background');
    } catch (e) {
      toastFor((e as Error).message || 'Could not select the subject');
    } finally {
      setBusy('');
    }
  };

  // Content-aware "Remove object": select the thing (marquee/lasso/wand), then
  // MI-GAN inpaints the selected region ON-DEVICE (model lazy-loaded from CDN
  // on first use). The result replaces the active image/paint layer's pixels.
  const runRemoveObject = async () => {
    const target = activeLayer;
    if (!target || (target.kind !== 'paint' && target.kind !== 'image')) { toastFor('Pick an image or paint layer first'); return; }
    if (!doc.selection) { toastFor('Select the object to remove first (marquee, lasso, or magic wand)'); return; }
    if (!(await guard())) return;
    setBusy('Loading model…');
    try {
      const { inpaint, inpaintReady } = await import('@/lib/studios/inpaint');
      if (!inpaintReady()) setBusy('Downloading remover model (~28 MB, on your device)…');
      // Inpaint the full composited image so the fill samples all visible
      // content; the selection mask marks what to remove.
      const result = await inpaint(composite as HTMLCanvasElement, doc.selection.mask, (p) => {
        setBusy(p.phase === 'Downloading model' ? `Downloading model… ${Math.round(p.ratio * 100)}%` : `${p.phase}…`);
      });
      const next = cloneDoc(doc);
      const idx = next.layers.findIndex(l => l.id === target.id);
      if (idx >= 0) {
        const l = next.layers[idx];
        if (l.kind === 'paint' || l.kind === 'image') (l as PaintLayer | ImageLayer).canvas = result;
      }
      next.selection = null;
      commit('remove object', next);
      bumpRevision(target.id);
      toastFor('Object removed — on-device, nothing uploaded');
    } catch (e) {
      toastFor((e as Error).message || 'Could not remove the object');
    } finally {
      setBusy('');
    }
  };

  const addAdjustment = (kind: AdjustmentLayer['adjustKind']) => {
    const defaults: Record<typeof kind, Record<string, number>> = {
      'bright-contrast': { brightness: 100, contrast: 100 },
      'hue-sat': { hue: 0, saturate: 100, lightness: 100 },
      'levels': { blackIn: 0, whiteIn: 255, gamma: 1, blackOut: 0, whiteOut: 255 },
      'curves': { p0: 0, p1: 64, p2: 128, p3: 192, p4: 255 },
      'color-balance': { r: 0, g: 0, b: 0 },
      'invert': {},
    };
    const al: AdjustmentLayer = {
      id: lid(), kind: 'adjust',
      name: kind === 'bright-contrast' ? 'Brightness/Contrast'
        : kind === 'hue-sat' ? 'Hue/Saturation'
        : kind === 'levels' ? 'Levels'
        : kind === 'curves' ? 'Curves'
        : kind === 'color-balance' ? 'Color Balance'
        : 'Invert',
      visible: true, locked: false, opacity: 1, blend: 'source-over',
      adjust: { ...ZERO_ADJUST },
      adjustKind: kind,
      params: { ...defaults[kind] },
      // Curve layers start with an identity per-channel CurveSet (master only)
      // so the interactive RGB curve editor has something to edit.
      ...(kind === 'curves' ? { curveSet: { master: { points: [...IDENTITY_CURVE.points] } } } : {}),
    };
    addLayer(al, 'adjustment');
  };

  const flipActive = (axis: 'h' | 'v') => {
    if (!activeLayer || (activeLayer.kind !== 'image' && activeLayer.kind !== 'paint')) {
      toastFor('Pick an image or paint layer');
      return;
    }
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === activeLayer.id);
    if (!l || (l.kind !== 'image' && l.kind !== 'paint')) return;
    const src = (l as PaintLayer | ImageLayer).canvas;
    const out = blankCanvas(src.width, src.height);
    const ctx = out.getContext('2d')!;
    ctx.translate(axis === 'h' ? src.width : 0, axis === 'v' ? src.height : 0);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(src, 0, 0);
    (l as PaintLayer | ImageLayer).canvas = out;
    commit('flip', next);
  };

  const rotateActive = (deg: number) => {
    if (!activeLayer) return;
    if (activeLayer.kind === 'image') {
      const next = cloneDoc(doc);
      const l = next.layers.find(x => x.id === activeLayer.id) as ImageLayer | undefined;
      if (!l) return;
      l.rotation = (l.rotation + deg) % 360;
      commit('rotate', next);
    } else if (activeLayer.kind === 'paint') {
      const next = cloneDoc(doc);
      const l = next.layers.find(x => x.id === activeLayer.id) as PaintLayer | undefined;
      if (!l) return;
      const src = l.canvas;
      const out = blankCanvas(src.height, src.width);
      const ctx = out.getContext('2d')!;
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      l.canvas = out;
      commit('rotate', next);
    }
  };

  const clearSelection = () => {
    if (!doc.selection) return;
    setDoc(d => ({ ...d, selection: null }));
  };

  // ---- Layer masks (non-destructive) --------------------------------------
  // A mask is a grayscale canvas: white reveals the layer, black hides it.
  // New masks start fully white (layer unchanged) unless seeded from the
  // active selection. Painting into the mask happens via "Edit Mask" mode.
  const addMaskToLayer = (id: string, fromSelection = false) => {
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === id);
    if (!l) return;
    const m = blankCanvas(doc.width, doc.height);
    const mctx = m.getContext('2d')!;
    if (fromSelection && next.selection) {
      // Seed the mask from the selection: selected area = white (revealed).
      mctx.fillStyle = '#000'; mctx.fillRect(0, 0, doc.width, doc.height);
      mctx.drawImage(next.selection.mask, 0, 0, doc.width, doc.height);
      next.selection = null;
    } else {
      mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, doc.width, doc.height);
    }
    l.mask = m;
    commit(fromSelection ? 'mask from selection' : 'add mask', next);
    setMaskEditId(id);
    bumpRevision(id);
  };

  const removeMaskFromLayer = (id: string) => {
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === id);
    if (!l) return;
    l.mask = undefined;
    commit('remove mask', next);
    if (maskEditId === id) setMaskEditId(null);
    bumpRevision(id);
  };

  const fillSelectionWith = (color: string) => {
    const layer = activeLayer;
    if (!layer || (layer.kind !== 'paint' && layer.kind !== 'image')) return;
    const next = cloneDoc(doc);
    const l = next.layers.find(x => x.id === layer.id) as PaintLayer | ImageLayer | undefined;
    if (!l) return;
    const ctx = l.canvas.getContext('2d')!;
    if (next.selection) {
      const tmp = blankCanvas(l.canvas.width, l.canvas.height);
      const tctx = tmp.getContext('2d')!;
      tctx.fillStyle = color;
      tctx.fillRect(0, 0, l.canvas.width, l.canvas.height);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(next.selection.mask, 0, 0, l.canvas.width, l.canvas.height);
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, l.canvas.width, l.canvas.height);
    }
    commit('fill', next);
  };

  useRegisterShortcuts([
    {
      label: 'Tools',
      items: TOOLS.map(t => ({ combo: t.key, description: t.label })),
    },
    {
      label: 'File',
      items: [
        { combo: 'mod+n', description: 'New document' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
        { combo: 'mod+d', description: 'Deselect' },
        { combo: 'mod+a', description: 'Select all' },
        { combo: 'delete', description: 'Fill with background' },
      ],
    },
    {
      label: 'View',
      items: [
        { combo: 'mod+0', description: 'Fit to screen' },
        { combo: '+', description: 'Zoom in' },
        { combo: '-', description: 'Zoom out' },
        { combo: '[', description: 'Decrease brush size' },
        { combo: ']', description: 'Increase brush size' },
        { combo: 'x', description: 'Swap foreground/background colors' },
      ],
    },
  ]);

  useShortcuts([
    ...TOOLS.map(t => ({ combo: t.key, handler: () => setTool(t.tool), description: t.label })),
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+y', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'mod+n', handler: () => setNewDialog(true) },
    { combo: 'mod+d', handler: clearSelection },
    { combo: 'mod+0', handler: fitToScreen },
    { combo: 'mod+a', handler: () => {
      const next = cloneDoc(doc);
      next.selection = { kind: 'rect', mask: rectMask(doc.width, doc.height, 0, 0, doc.width, doc.height) };
      commit('select all', next);
    }},
    { combo: 'delete', handler: () => fillSelectionWith(bgColor) },
    { combo: 'backspace', handler: () => fillSelectionWith(bgColor) },
    { combo: 'x', handler: () => { setFgColor(bgColor); setBgColor(fgColor); } },
    { combo: '[', handler: () => setBrushSize(s => Math.max(1, s - 2)) },
    { combo: ']', handler: () => setBrushSize(s => Math.min(400, s + 2)) },
    { combo: '+', handler: () => setZoom(z => Math.min(8, z * 1.2)) },
    { combo: '-', handler: () => setZoom(z => Math.max(0.05, z / 1.2)) },
  ]);

  const screenToCanvas = (e: { clientX: number; clientY: number }) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const r = wrap.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - pan.x) / zoom,
      y: (e.clientY - r.top - pan.y) / zoom,
    };
  };

  const ptrState = React.useRef<{
    down: boolean; tool: ToolKind | null;
    startX: number; startY: number;
    lastX: number; lastY: number;
    points: { x: number; y: number }[];
    targetCanvas?: HTMLCanvasElement;
    panStart?: { x: number; y: number };
    cloneOffset?: { dx: number; dy: number } | null;  // source→dest offset for clone/heal
  }>({ down: false, tool: null, startX: 0, startY: 0, lastX: 0, lastY: 0, points: [] });
  // Clone/heal source point (set with Alt-click). Offset from the first stroke
  // point keeps the sampled region tracking the brush.
  const cloneSrc = React.useRef<{ x: number; y: number } | null>(null);

  /**
   * Clone stamp / healing brush. Samples a circular patch from `cloneSrc` (+the
   * running offset) on the FLATTENED image and stamps it under the cursor. Heal
   * = the same patch blended so its mean matches the destination (texture from
   * the source, color/luminance from the target — Photoshop's spot-heal feel).
   */
  const stampAt = (target: HTMLCanvasElement, x: number, y: number, heal: boolean) => {
    const src = cloneSrc.current;
    const off = ptrState.current.cloneOffset;
    if (!src || !off) return;
    const r = Math.max(2, brushSize / 2);
    const sx = x + off.dx, sy = y + off.dy;
    // Sample the source from the composited image (so it works across layers).
    const flat = composite; // the live composited canvas (HTMLCanvasElement)
    if (!flat) return;
    const sctx = (flat as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
    const dctx = target.getContext('2d', { willReadFrequently: true });
    if (!sctx || !dctx) return;
    const d = Math.ceil(r * 2);
    const sxi = Math.round(sx - r), syi = Math.round(sy - r);
    const dxi = Math.round(x - r), dyi = Math.round(y - r);
    let patch: ImageData;
    try { patch = sctx.getImageData(sxi, syi, d, d); } catch { return; }
    if (heal) {
      // Match the patch's mean color to the destination patch (heal = texture
      // from source, tone from target).
      let dst: ImageData; try { dst = dctx.getImageData(dxi, dyi, d, d); } catch { return; }
      const meanOf = (im: ImageData) => { let r0 = 0, g0 = 0, b0 = 0, n = 0; for (let i = 0; i < im.data.length; i += 4) { if (im.data[i + 3] > 8) { r0 += im.data[i]; g0 += im.data[i + 1]; b0 += im.data[i + 2]; n++; } } return n ? [r0 / n, g0 / n, b0 / n] : [0, 0, 0]; };
      const [sr, sg, sb] = meanOf(patch); const [dr, dg, db] = meanOf(dst);
      for (let i = 0; i < patch.data.length; i += 4) {
        patch.data[i] = Math.max(0, Math.min(255, patch.data[i] + (dr - sr)));
        patch.data[i + 1] = Math.max(0, Math.min(255, patch.data[i + 1] + (dg - sg)));
        patch.data[i + 2] = Math.max(0, Math.min(255, patch.data[i + 2] + (db - sb)));
      }
    }
    // Feather the patch into a circular soft-edged brush via a temp canvas.
    const tmp = blankCanvas(d, d);
    const tctx = tmp.getContext('2d')!;
    tctx.putImageData(patch, 0, 0);
    const round = blankCanvas(d, d);
    const rctx = round.getContext('2d')!;
    const grad = rctx.createRadialGradient(r, r, r * 0.4, r, r, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = grad; rctx.beginPath(); rctx.arc(r, r, r, 0, Math.PI * 2); rctx.fill();
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(round, 0, 0);
    dctx.globalAlpha = brushOpacity / 100;
    dctx.drawImage(tmp, dxi, dyi);
    dctx.globalAlpha = 1;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = screenToCanvas(e);
    ptrState.current.down = true;
    ptrState.current.tool = tool;
    ptrState.current.startX = p.x; ptrState.current.startY = p.y;
    ptrState.current.lastX = p.x; ptrState.current.lastY = p.y;
    ptrState.current.points = [{ x: p.x, y: p.y }];

    if (tool === 'hand' || e.button === 1) {
      ptrState.current.panStart = { x: pan.x - e.clientX, y: pan.y - e.clientY };
      return;
    }
    if (tool === 'zoom') {
      const factor = e.shiftKey ? 1 / 1.5 : 1.5;
      setZoom(z => Math.max(0.05, Math.min(16, z * factor)));
      return;
    }
    if (tool === 'eyedropper') {
      const px = Math.max(0, Math.min(doc.width - 1, Math.floor(p.x)));
      const py = Math.max(0, Math.min(doc.height - 1, Math.floor(p.y)));
      const d = composite.getContext('2d')!.getImageData(px, py, 1, 1).data;
      setFgColor(rgbToHex(d[0], d[1], d[2]));
      return;
    }
    if (tool === 'wand') {
      const mask = magicWand(composite, p.x, p.y, wandTol);
      const next = cloneDoc(doc);
      next.selection = { kind: 'wand', mask };
      commit('magic wand', next);
      return;
    }
    if (tool === 'clone' || tool === 'heal') {
      // Alt-click sets the clone/heal SOURCE point.
      if (e.altKey) { cloneSrc.current = { x: p.x, y: p.y }; ptrState.current.down = false; toastFor('Clone source set — now paint over the area to fix'); return; }
      if (!cloneSrc.current) { toastFor('Alt-click to set a source point first'); ptrState.current.down = false; return; }
      const layer = ensurePaintLayer();
      ptrState.current.targetCanvas = layer.canvas;
      // Offset from this first dab to the source, held for the whole stroke.
      ptrState.current.cloneOffset = { dx: cloneSrc.current.x - p.x, dy: cloneSrc.current.y - p.y };
      stampAt(layer.canvas, p.x, p.y, tool === 'heal');
      bumpRevision(layer.id);
      scheduleBrushRedraw();
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      // Mask-edit mode: paint into the active layer's mask instead of its pixels.
      if (maskEditId) {
        const ml = doc.layers.find(l => l.id === maskEditId);
        if (ml?.mask) {
          ptrState.current.targetCanvas = ml.mask;
          strokeAt(ml.mask, p.x, p.y, p.x, p.y);
          bumpRevision(ml.id);
          scheduleBrushRedraw();
          return;
        }
      }
      const layer = ensurePaintLayer();
      ptrState.current.targetCanvas = layer.canvas;
      strokeAt(layer.canvas, p.x, p.y, p.x, p.y);
      bumpRevision(layer.id);
      scheduleBrushRedraw();
      return;
    }
    if (tool === 'bucket') {
      const layer = ensurePaintLayer();
      bucketFill(layer.canvas, Math.floor(p.x), Math.floor(p.y), fgColor, wandTol);
      const next = cloneDoc(doc);
      const idx = next.layers.findIndex(l => l.id === layer.id);
      if (idx >= 0) (next.layers[idx] as PaintLayer).canvas = cloneCanvas(layer.canvas);
      commit('bucket', next);
      return;
    }
    if (tool === 'text') {
      const t: TextLayer = {
        id: lid(), kind: 'text', name: 'Text',
        text: 'Type here', x: p.x, y: p.y,
        size: textSettings.size, color: textSettings.color, font: textSettings.font,
        weight: textSettings.weight, italic: textSettings.italic, align: textSettings.align,
        letterSpacing: textSettings.letterSpacing, lineHeight: textSettings.lineHeight,
        outline: textSettings.outline, outlineColor: textSettings.outlineColor, outlineWidth: textSettings.outlineWidth,
        shadow: textSettings.shadow, shadowBlur: textSettings.shadowBlur, shadowColor: textSettings.shadowColor,
        visible: true, locked: false, opacity: 1, blend: 'source-over', adjust: { ...ZERO_ADJUST },
      };
      addLayer(t, 'add text');
      setTextEditOpen(t.id);
      return;
    }
    if (tool === 'shape-rect' || tool === 'shape-ellipse') {
      const s: ShapeLayer = {
        id: lid(), kind: 'shape', name: tool === 'shape-rect' ? 'Rectangle' : 'Ellipse',
        shape: tool === 'shape-rect' ? 'rect' : 'ellipse',
        x: p.x, y: p.y, w: 1, h: 1,
        fill: shapeSettings.fill, stroke: shapeSettings.stroke, strokeWidth: shapeSettings.strokeWidth,
        radius: shapeSettings.radius,
        visible: true, locked: false, opacity: 1, blend: 'source-over', adjust: { ...ZERO_ADJUST },
      };
      addLayer(s, 'shape');
    }
  };

  // Live brush cursor-ring (Photopea/Photoshop parity): track the pointer in
  // canvas space on every move so we can draw a ring sized to the brush. Stored
  // in a ref + a tiny state flag so the ring follows with no React churn on the
  // stroke path (we position it directly via the ref in the render).
  const hoverRef = React.useRef<{ x: number; y: number } | null>(null);
  const [hoverTick, setHoverTick] = React.useState(0);
  const onCanvasHover = (e: React.PointerEvent) => {
    const t = tool;
    if (t !== 'brush' && t !== 'eraser') { if (hoverRef.current) { hoverRef.current = null; setHoverTick(n => n + 1); } return; }
    const p = screenToCanvas(e);
    hoverRef.current = { x: p.x, y: p.y };
    setHoverTick(n => n + 1); // cheap: only re-renders the ring overlay
  };

  const onPointerMove = (e: React.PointerEvent) => {
    onCanvasHover(e);
    if (!ptrState.current.down) return;
    const p = screenToCanvas(e);
    const t = ptrState.current.tool;
    if (t === 'hand' || (e.buttons & 4)) {
      const ps = ptrState.current.panStart;
      if (ps) setPan({ x: ps.x + e.clientX, y: ps.y + e.clientY });
      return;
    }
    if (t === 'brush' || t === 'eraser') {
      const c = ptrState.current.targetCanvas;
      if (c) {
        strokeAt(c, ptrState.current.lastX, ptrState.current.lastY, p.x, p.y);
        const activeId = doc.activeId;
        if (activeId) bumpRevision(activeId);
        scheduleBrushRedraw();
      }
    }
    if (t === 'clone' || t === 'heal') {
      const c = ptrState.current.targetCanvas;
      if (c && ptrState.current.cloneOffset) {
        // Dab along the move segment so fast drags stay continuous.
        const steps = Math.max(1, Math.floor(Math.hypot(p.x - ptrState.current.lastX, p.y - ptrState.current.lastY) / Math.max(2, brushSize * 0.25)));
        for (let i = 1; i <= steps; i++) {
          const cx = ptrState.current.lastX + (p.x - ptrState.current.lastX) * (i / steps);
          const cy = ptrState.current.lastY + (p.y - ptrState.current.lastY) * (i / steps);
          stampAt(c, cx, cy, t === 'heal');
        }
        if (doc.activeId) bumpRevision(doc.activeId);
        scheduleBrushRedraw();
      }
    }
    if (t === 'lasso') {
      ptrState.current.points.push(p);
      force();
    }
    if (t === 'shape-rect' || t === 'shape-ellipse') {
      const next = cloneDoc(doc);
      const last = next.layers[next.layers.length - 1];
      if (last && last.kind === 'shape') {
        last.w = p.x - ptrState.current.startX;
        last.h = p.y - ptrState.current.startY;
        if (last.w < 0) { last.x = p.x; last.w = -last.w; } else { last.x = ptrState.current.startX; }
        if (last.h < 0) { last.y = p.y; last.h = -last.h; } else { last.y = ptrState.current.startY; }
      }
      setDoc(next);
    }
    if (t === 'move' && activeLayer) {
      const next = cloneDoc(doc);
      const l = next.layers.find(x => x.id === activeLayer.id);
      if (l) {
        if (l.kind === 'image' || l.kind === 'text' || l.kind === 'shape') {
          l.x += p.x - ptrState.current.lastX;
          l.y += p.y - ptrState.current.lastY;
          setDoc(next);
        }
      }
    }
    ptrState.current.lastX = p.x;
    ptrState.current.lastY = p.y;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!ptrState.current.down) return;
    const t = ptrState.current.tool;
    const p = screenToCanvas(e);
    ptrState.current.down = false;
    if (t === 'brush') commit('brush', doc);
    if (t === 'eraser') commit('eraser', doc);
    if (t === 'clone') { ptrState.current.cloneOffset = null; commit('clone stamp', doc); }
    if (t === 'heal') { ptrState.current.cloneOffset = null; commit('heal', doc); }
    if (t === 'move') commit('move', doc);
    if (t === 'shape-rect' || t === 'shape-ellipse') commit('shape', doc);
    if (t === 'marquee-rect' || t === 'marquee-ellipse') {
      const x = Math.min(ptrState.current.startX, p.x);
      const y = Math.min(ptrState.current.startY, p.y);
      const w = Math.abs(p.x - ptrState.current.startX);
      const h = Math.abs(p.y - ptrState.current.startY);
      if (w > 2 && h > 2) {
        const next = cloneDoc(doc);
        next.selection = {
          kind: t === 'marquee-rect' ? 'rect' : 'ellipse',
          mask: rectMask(doc.width, doc.height, x, y, w, h, t === 'marquee-ellipse'),
        };
        commit('select', next);
      }
    }
    if (t === 'lasso') {
      const pts = ptrState.current.points;
      if (pts.length > 3) {
        const next = cloneDoc(doc);
        next.selection = { kind: 'lasso', mask: lassoMask(doc.width, doc.height, pts) };
        commit('lasso', next);
      }
    }
    if (t === 'crop') {
      const x = Math.max(0, Math.min(doc.width, ptrState.current.startX));
      const y = Math.max(0, Math.min(doc.height, ptrState.current.startY));
      const x2 = Math.max(0, Math.min(doc.width, p.x));
      const y2 = Math.max(0, Math.min(doc.height, p.y));
      const cx = Math.min(x, x2), cy = Math.min(y, y2);
      const cw = Math.abs(x2 - x), ch = Math.abs(y2 - y);
      if (cw > 4 && ch > 4) {
        const next = cloneDoc(doc);
        next.width = cw;
        next.height = ch;
        for (const l of next.layers) {
          if (l.kind === 'paint' || l.kind === 'image') {
            const src = (l as PaintLayer | ImageLayer).canvas;
            const out = blankCanvas(cw, ch);
            const ctx = out.getContext('2d')!;
            if (l.kind === 'paint') ctx.drawImage(src, -cx, -cy);
            else {
              ctx.drawImage(src, (l as ImageLayer).x - cx, (l as ImageLayer).y - cy);
              (l as ImageLayer).x = 0;
              (l as ImageLayer).y = 0;
            }
            (l as PaintLayer | ImageLayer).canvas = out;
          } else if (l.kind === 'text' || l.kind === 'shape') {
            (l as TextLayer | ShapeLayer).x -= cx;
            (l as TextLayer | ShapeLayer).y -= cy;
          }
        }
        next.selection = null;
        commit('crop', next);
        requestAnimationFrame(fitToScreen);
      }
    }
    ptrState.current.tool = null;
    ptrState.current.points = [];
  };

  const strokeAt = (target: HTMLCanvasElement, x1: number, y1: number, x2: number, y2: number) => {
    // When a selection is active, paint onto a scratch canvas, intersect the
    // stroke with the selection's alpha mask, then composite the masked stroke
    // back onto the target. Canvas clip() only does path clipping — it can't
    // honor an arbitrary pixel mask, which is why the old `rect(0,0,w,h)` clip
    // was a no-op and "painting in a selection" leaked outside it.
    const sel = doc.selection;
    // Painting INTO a layer mask: the brush reveals (white) and the eraser
    // hides (black) — both opaque marks onto the grayscale mask, never erasing
    // pixels. fgColor is forced white so soft brushes feather the mask.
    const paintingMask = maskEditId != null && target === doc.layers.find(l => l.id === maskEditId)?.mask;
    const strokeColor = paintingMask ? '#ffffff' : fgColor;
    const eraseLikeBlack = paintingMask && tool === 'eraser';
    const ctx0 = target.getContext('2d')!;
    const usingMask = !!sel;
    const work = usingMask ? blankCanvas(target.width, target.height) : target;
    const ctx = work.getContext('2d')!;
    ctx.save();
    const finishMasked = () => {
      if (!usingMask) return;
      const mctx = work.getContext('2d')!;
      mctx.globalCompositeOperation = 'destination-in';
      mctx.drawImage(sel!.mask, 0, 0, work.width, work.height);
      mctx.globalCompositeOperation = 'source-over';
      // Eraser strokes must REMOVE from the target through the mask; brush adds.
      // (When painting a mask the eraser draws black, so it's a normal add.)
      ctx0.save();
      ctx0.globalCompositeOperation = (tool === 'eraser' && !paintingMask) ? 'destination-out' : 'source-over';
      ctx0.drawImage(work, 0, 0);
      ctx0.restore();
    };
    if (tool === 'eraser' && !paintingMask) {
      // When masking, paint OPAQUE onto the scratch — finishMasked() then erases
      // the target through the mask via destination-out. Direct (no mask) erases
      // the target straight away.
      ctx.globalCompositeOperation = usingMask ? 'source-over' : 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = eraserSize;
    } else {
      // Brush (or, when painting a mask, the eraser drawing black to hide).
      const paintColor = eraseLikeBlack ? '#000000' : strokeColor;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = brushOpacity / 100;
      const hardness = brushHard / 100;
      if (hardness < 0.95) {
        const [r, g, b] = hexToRgb(paintColor);
        const grad = ctx.createRadialGradient(x2, y2, brushSize * 0.2 * hardness, x2, y2, brushSize / 2);
        grad.addColorStop(0, `rgba(${r},${g},${b},${brushFlow / 100})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        const steps = Math.max(1, Math.floor(Math.hypot(x2 - x1, y2 - y1) / (brushSize * 0.25)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = x1 + (x2 - x1) * t;
          const cy = y1 + (y2 - y1) * t;
          const g2 = ctx.createRadialGradient(cx, cy, brushSize * 0.2 * hardness, cx, cy, brushSize / 2);
          g2.addColorStop(0, `rgba(${r},${g},${b},${brushFlow / 100})`);
          g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        finishMasked();
        return;
      }
      ctx.strokeStyle = paintColor;
      ctx.lineWidth = brushSize;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (Math.hypot(x2 - x1, y2 - y1) < 0.5) {
      ctx.beginPath();
      ctx.arc(x2, y2, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = eraseLikeBlack ? '#000' : (tool === 'eraser' ? '#000' : strokeColor);
      ctx.fill();
    }
    ctx.restore();
    finishMasked();
  };

  const wheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      const wrap = wrapRef.current!;
      const r = wrap.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const newZoom = Math.max(0.05, Math.min(16, zoom * factor));
      setPan({
        x: cx - (cx - pan.x) * (newZoom / zoom),
        y: cy - (cy - pan.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
    } else if (e.shiftKey) {
      setPan(p => ({ x: p.x - e.deltaY, y: p.y }));
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const renameLayer = (id: string, name: string) => {
    setDoc(d => ({ ...d, layers: d.layers.map(l => l.id === id ? { ...l, name } : l) }));
  };

  const textEditing = textEditOpen ? doc.layers.find(l => l.id === textEditOpen) as TextLayer | undefined : undefined;

  // Pristine = a brand-new, empty doc (one untouched blank paint layer). While
  // pristine, the filter strip and the tool rail do nothing useful, so we quiet
  // them — the first-timer's eye then lands on "open an image", not a wall of
  // filters/tools. They light back up the moment real content exists.
  const pristine = doc.layers.length === 1 && doc.layers[0].kind === 'paint' && doc.name === 'Untitled';

  return (
    <StudioShell>
      {policyGate.element}
      {recovery && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          <History className="h-4 w-4 shrink-0" />
          <span className="flex-1">Recovered an unsaved session{recovery.name && recovery.name !== 'Untitled' ? ` — "${recovery.name}"` : ''}. Restore it?</span>
          <button onClick={doRecover} className="rounded bg-amber-400 px-3 py-1 font-semibold text-zinc-900 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-white/5">Dismiss</button>
        </div>
      )}
      <StudioTopBar
        title="Image Studio Pro"
        left={
          <>
            <StudioButton variant="ghost" size="sm" onClick={() => setNewDialog(true)} title="New (Ctrl+N)"><FileText className="h-3.5 w-3.5" /> New</StudioButton>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Open
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && openImageFiles(e.target.files)} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved} title="Open from library (Ctrl+O)"><LayersIcon className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent} title="Save (Ctrl+S)"><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            {/* On mobile Export lives PINNED in the right cluster — buried in this
                scrollable strip it was effectively unreachable (no scroll affordance). */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export (Ctrl+E)"><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <StudioButton variant="soft" size="sm" onClick={() => void runSelectSubject()} title="Select Subject — one click selects the person/object (on-device AI)"><Sparkles className="h-3.5 w-3.5" /> Select Subject</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => void runRemoveBg()} title="Remove Background (AI)"><Sparkles className="h-3.5 w-3.5" /> Remove BG</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => void runRemoveObject()} title="Select an object, then remove it (content-aware, on-device)"><Sparkles className="h-3.5 w-3.5" /> Remove Object</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => void runAutoEnhance()} title="Auto-enhance (white balance + levels)"><Sparkles className="h-3.5 w-3.5" /> Enhance</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => void runExtractPalette()} title="Extract color palette"><Sparkles className="h-3.5 w-3.5" /> Palette</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => setSmartCropDialog(true)} title="Smart crop for social"><Sparkles className="h-3.5 w-3.5" /> Smart Crop</StudioButton>
            <select
              onChange={e => { if (e.target.value) { applyColorGrade(e.target.value); e.target.value = ''; } }}
              defaultValue=""
              title="Apply color grade preset"
              className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs text-zinc-100"
            >
              <option value="" disabled>🎨 Grade…</option>
              {(['cinematic', 'vibrant', 'vintage', 'mono', 'mood'] as ColorGrade['category'][]).map(cat => (
                <optgroup key={cat} label={cat[0].toUpperCase() + cat.slice(1)}>
                  {COLOR_GRADES.filter(g => g.category === cat).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input
              value={doc.name}
              onChange={e => setDoc(d => ({ ...d, name: e.target.value }))}
              className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50"
            />
          </>
        }
        right={
          <>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()} title="Undo (Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()} title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            <span className="h-5 w-px bg-white/10" />
            <StudioButton variant="ghost" size="sm" onClick={() => setShowLayersPanel(s => !s)} title="Layers panel"><LayersIcon className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => setShowAdjustPanel(s => !s)} title="Adjustments"><Sliders className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => setShowHistoryPanel(s => !s)} title="History"><History className="h-3.5 w-3.5" /></StudioButton>
            {/* Keyboard-shortcut help is meaningless on touch; its slot goes to Export. */}
            <DesktopOnly><HelpButton /></DesktopOnly>
            <MobileOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export"><Download className="h-3.5 w-3.5" /></StudioButton></MobileOnly>
          </>
        }
      />

      <div className={cn('transition-opacity', pristine && 'pointer-events-none opacity-40')}>
      <ToolOptionsBar
        tool={tool}
        brushSize={brushSize} setBrushSize={setBrushSize}
        brushHard={brushHard} setBrushHard={setBrushHard}
        brushOpacity={brushOpacity} setBrushOpacity={setBrushOpacity}
        brushFlow={brushFlow} setBrushFlow={setBrushFlow}
        eraserSize={eraserSize} setEraserSize={setEraserSize}
        wandTol={wandTol} setWandTol={setWandTol}
        fgColor={fgColor} setFgColor={setFgColor}
        bgColor={bgColor} setBgColor={setBgColor}
        textSettings={textSettings} setTextSettings={setTextSettings}
        shapeSettings={shapeSettings} setShapeSettings={setShapeSettings}
        onFilter={k => { setFilterDialog(k); setFilterParam(k === 'posterize' ? 4 : k === 'pixelate' ? 10 : 6); }}
        onFlip={flipActive}
        onRotate={rotateActive}
        onAddAdjustment={addAdjustment}
        onFitScreen={fitToScreen}
        onClearSelection={clearSelection}
        hasSelection={!!doc.selection}
      />
      </div>

      <StudioBody>
        <StudioToolDock>
          {TOOLS.map(t => (
            <StudioToolButton
              key={t.tool}
              active={tool === t.tool}
              label={t.label}
              hint={formatCombo(t.key)}
              onClick={() => setTool(t.tool)}
            >
              {t.icon}
            </StudioToolButton>
          ))}
          <StudioDivider />
          <div className="relative h-9 w-9">
            <button
              title="Foreground color"
              onClick={() => document.getElementById('fg-color')?.click()}
              className="absolute left-0 top-0 h-6 w-6 rounded border border-white/20 shadow"
              style={{ background: fgColor }}
            />
            <input id="fg-color" type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} className="absolute opacity-0 pointer-events-none" />
            <button
              title="Background color"
              onClick={() => document.getElementById('bg-color')?.click()}
              className="absolute right-0 bottom-0 h-6 w-6 rounded border border-white/20 shadow"
              style={{ background: bgColor }}
            />
            <input id="bg-color" type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="absolute opacity-0 pointer-events-none" />
          </div>
        </StudioToolDock>

        <StudioCanvasArea>
          {!welcomed && doc.layers.length === 1 && doc.layers[0].kind === 'paint' && doc.name === 'Untitled' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
              <EmptyState
                icon={<ImageIcon className="h-7 w-7" />}
                title="Start your image project"
                description="Open a file, drop an image anywhere, or pick a starting size. Layers, AI tools, and ~14 grades are one click away."
                actions={[
                  { label: 'Open or drop image', description: 'PNG, JPG, WebP, HEIC...', icon: <Upload className="h-4 w-4" />, onClick: () => { dismissWelcome(); document.querySelector<HTMLInputElement>('input[type=file]')?.click(); }, primary: true },
                  { label: 'New document', description: 'Pick a preset size to start blank', icon: <FileText className="h-4 w-4" />, onClick: () => { dismissWelcome(); setNewDialog(true); } },
                  { label: 'Open from Library', description: 'Continue a saved project', icon: <LayersIcon className="h-4 w-4" />, onClick: () => { dismissWelcome(); void openSaved(); } },
                  { label: 'Start painting now', description: 'Skip and use the current blank canvas', icon: <Brush className="h-4 w-4" />, onClick: dismissWelcome },
                ]}
                hints={[
                  { label: 'AI tools', description: 'Background remove, auto-enhance, smart crop, palette' },
                  { label: 'Layer styles + animations', description: 'Shadow / glow / stroke + entrance/emphasis/exit' },
                  { label: 'Press ?', description: 'See every shortcut' },
                ]}
              />
            </div>
          )}
          <div
            ref={wrapRef}
            // touch-action:none — single-finger paint/drag/pan on the canvas must
            // not scroll the surrounding marketing page or fire browser gestures.
            // usePinchPan already preventDefaults 2-finger; this covers 1-finger.
            // Inert on desktop (mouse is unaffected by touch-action).
            className={cn('absolute inset-0 [touch-action:none]', (tool === 'brush' || tool === 'eraser') ? 'cursor-none' : 'cursor-crosshair')}
            onWheel={wheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => { if (hoverRef.current) { hoverRef.current = null; setHoverTick(n => n + 1); } }}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                width: doc.width,
                height: doc.height,
              }}
              className="absolute left-0 top-0"
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)',
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
                  backgroundColor: '#1a1a1a',
                }}
              />
              <canvas
                ref={canvasRef}
                className="absolute left-0 top-0 outline outline-1 outline-white/10"
                style={{ imageRendering: zoom > 4 ? 'pixelated' : 'auto' }}
              />
              {/* Brush cursor-ring: a live circle sized to the brush, in canvas
                  space (scales with zoom). Only for brush/eraser; follows the
                  pointer with no perceptible lag. _hoverTick forces the position
                  to re-read on move. */}
              {(tool === 'brush' || tool === 'eraser') && hoverRef.current && (
                <div
                  data-hovertick={hoverTick}
                  className="pointer-events-none absolute rounded-full border border-white/90 mix-blend-difference"
                  style={{
                    left: hoverRef.current.x - brushSize / 2,
                    top: hoverRef.current.y - brushSize / 2,
                    width: brushSize,
                    height: brushSize,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                  }}
                />
              )}
              {showGrid ? (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ backgroundImage: 'linear-gradient(to right,rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.08) 1px,transparent 1px)', backgroundSize: '32px 32px' }}
                />
              ) : null}
            </div>
          </div>

          {tool === 'lasso' && ptrState.current.points.length > 1 && (
            <svg className="pointer-events-none absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              <polyline
                points={ptrState.current.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke="#22d3ee" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              />
            </svg>
          )}

          {busy && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur">
              <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> {busy}
            </div>
          )}
          {toast && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">
              {toast}
            </div>
          )}
        </StudioCanvasArea>

        {showLayersPanel ? (
          <StudioSidebar width={296}>
            {activeLayer && (
              <>
                <LayerPropsPanel
                  layer={activeLayer}
                  onChange={(mut) => updateLayer(activeLayer.id, mut, 'layer props')}
                />
                <StudioPanel title="Layer styles" defaultOpen={!!activeLayer.styles}>
                  <LayerStylesPanelUI
                    styles={activeLayer.styles ?? {}}
                    onChange={(next) => updateLayer(activeLayer.id, (l) => { l.styles = next; }, 'styles')}
                  />
                </StudioPanel>
                <StudioPanel title="Layer animation" defaultOpen={!!activeLayer.animations}>
                  <AnimationPanel
                    value={activeLayer.animations ?? {}}
                    onChange={(next) => updateLayer(activeLayer.id, (l) => { l.animations = next; }, 'layer anim')}
                    title=""
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setAnimationPlay(p => !p)}
                      className={cn(
                        'flex-1 rounded px-2 py-1.5 text-xs font-medium',
                        animationPlay ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' : 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30',
                      )}
                    >
                      {animationPlay ? '■ Stop preview' : '▶ Preview animation'}
                    </button>
                    {animationPlay && <span className="tabular-nums text-[10px] text-zinc-400">{animationTime.toFixed(1)}s</span>}
                  </div>
                </StudioPanel>
              </>
            )}
            <StudioPanel title="Layers">
              <div className="space-y-1">
                <div className="flex gap-1 pb-2">
                  <StudioButton size="sm" variant="soft" onClick={() => addLayer(newPaintLayer())} title="New paint layer"><Plus className="h-3 w-3" /> Paint</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => duplicateLayer(activeLayer?.id ?? '')} disabled={!activeLayer}><Copy className="h-3 w-3" /></StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => moveLayer(activeLayer?.id ?? '', 1)} disabled={!activeLayer}><ChevronUp className="h-3 w-3" /></StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => moveLayer(activeLayer?.id ?? '', -1)} disabled={!activeLayer}><ChevronDown className="h-3 w-3" /></StudioButton>
                  <StudioButton size="sm" variant="danger" onClick={() => activeLayer && removeLayer(activeLayer.id)} disabled={!activeLayer}><Trash2 className="h-3 w-3" /></StudioButton>
                </div>
                {activeLayer && activeLayer.kind !== 'adjust' && (
                  <div className="flex flex-wrap gap-1 pb-2">
                    {!activeLayer.mask ? (
                      <>
                        <StudioButton size="sm" variant="soft" onClick={() => addMaskToLayer(activeLayer.id)} title="Add a layer mask (white = visible)">+ Mask</StudioButton>
                        {doc.selection && <StudioButton size="sm" variant="soft" onClick={() => addMaskToLayer(activeLayer.id, true)} title="Create a mask from the active selection">Mask from Sel</StudioButton>}
                      </>
                    ) : (
                      <>
                        <StudioButton size="sm" variant={maskEditId === activeLayer.id ? 'primary' : 'soft'} onClick={() => setMaskEditId(maskEditId === activeLayer.id ? null : activeLayer.id)} title="Paint into the mask: brush reveals, eraser hides">{maskEditId === activeLayer.id ? '● Editing Mask' : 'Edit Mask'}</StudioButton>
                        <StudioButton size="sm" variant="danger" onClick={() => removeMaskFromLayer(activeLayer.id)} title="Delete the layer mask">Remove Mask</StudioButton>
                      </>
                    )}
                  </div>
                )}
                {maskEditId && (
                  <div className="mb-2 rounded bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">Mask edit: <b>Brush</b> reveals, <b>Eraser</b> hides. Soft brush = feathered edges.</div>
                )}
                {activeLayer && (activeLayer.fx?.length ?? 0) > 0 && (
                  <div className="mb-2 space-y-1 rounded border border-white/10 p-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Effects (non-destructive)</div>
                    {activeLayer.fx!.map((f) => (
                      <div key={f.id} className="flex items-center gap-1.5 text-[11px]">
                        <input type="checkbox" checked={f.enabled} onChange={() => updateLayer(activeLayer.id, (l) => { const fx = l.fx?.find(x => x.id === f.id); if (fx) fx.enabled = !fx.enabled; }, 'toggle fx')} />
                        <span className="flex-1 capitalize text-zinc-300">{f.kind}</span>
                        <button onClick={() => updateLayer(activeLayer.id, (l) => { l.fx = (l.fx ?? []).filter(x => x.id !== f.id); }, 'remove fx')} className="text-zinc-500 hover:text-rose-400" title="Remove effect">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {[...doc.layers].reverse().map(l => (
                  <LayerRow
                    key={l.id}
                    layer={l}
                    active={l.id === doc.activeId}
                    onSelect={() => setActive(l.id)}
                    onToggle={() => updateLayer(l.id, x => { x.visible = !x.visible; }, 'visibility')}
                    onLock={() => updateLayer(l.id, x => { x.locked = !x.locked; }, 'lock')}
                    onRename={n => renameLayer(l.id, n)}
                    onDoubleClick={() => l.kind === 'text' && setTextEditOpen(l.id)}
                  />
                ))}
              </div>
            </StudioPanel>
          </StudioSidebar>
        ) : null}

        {showAdjustPanel ? (
          <StudioSidebar width={260}>
            <StudioPanel title="Adjustments">
              <div className="grid grid-cols-2 gap-2">
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('bright-contrast')}>Brightness/Contrast</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('hue-sat')}>Hue/Sat</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('levels')}>Levels</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('curves')}>Curves</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('color-balance')}>Color Balance</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => addAdjustment('invert')}>Invert</StudioButton>
              </div>
            </StudioPanel>
            {activeLayer && activeLayer.kind === 'adjust' ? (
              <AdjustmentEditor
                layer={activeLayer}
                onChange={(p) => updateLayer(activeLayer.id, (l) => { (l as AdjustmentLayer).params = { ...p }; }, 'adjust params')}
                onCurveSet={(cs) => updateLayer(activeLayer.id, (l) => { (l as AdjustmentLayer).curveSet = cs; }, 'curves')}
              />
            ) : null}
          </StudioSidebar>
        ) : null}

        {showHistoryPanel ? (
          <StudioSidebar width={200}>
            <StudioPanel title="History">
              <HistoryList stack={stack.current} onJump={jumpHistory} />
            </StudioPanel>
          </StudioSidebar>
        ) : null}
      </StudioBody>

      <StudioStatusBar>
        <span>{doc.width} × {doc.height}px</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>{doc.layers.length} layer{doc.layers.length === 1 ? '' : 's'}</span>
        {doc.selection ? <span className="text-cyan-300">Selection active</span> : null}
        <span className="ml-auto">{tool}</span>
      </StudioStatusBar>

      {gate}

      {newDialog && (
        <NewDocDialog onCancel={() => setNewDialog(false)} onCreate={(w, h, n, bg) => { startNew(w, h, n, bg); setNewDialog(false); }} />
      )}
      {exportDialog && (
        <ExportDialog fmt={exportFmt} setFmt={setExportFmt} q={exportQ} setQ={setExportQ} onCancel={() => setExportDialog(false)} onExport={exportImage} onPsd={() => void exportPsd()} layerCount={doc.layers.length} />
      )}
      {filterDialog && (
        <FilterDialog kind={filterDialog} value={filterParam} setValue={setFilterParam} onCancel={() => setFilterDialog(null)} onApply={(v) => runFilter(filterDialog, v)} />
      )}
      {openDialog && (
        <OpenDialog items={savedList} onCancel={() => setOpenDialog(false)} onPick={loadFromLibrary} />
      )}
      {smartCropDialog && (
        <DialogShell title="Smart Crop" onCancel={() => setSmartCropDialog(false)} onConfirm={() => setSmartCropDialog(false)} confirmLabel="Close">
          <div className="grid grid-cols-2 gap-2">
            {([['1:1 Square', 1, 1], ['9:16 Story', 9, 16], ['16:9 YouTube', 16, 9], ['4:5 Insta', 4, 5], ['3:2 Photo', 3, 2], ['21:9 Banner', 21, 9]] as const).map(([label, aw, ah]) => (
              <button key={label} onClick={() => runSmartCrop(aw, ah)} className="rounded bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">{label}</button>
            ))}
          </div>
          <div className="mt-2 rounded bg-cyan-500/10 p-2 text-xs text-cyan-200">Crop is auto-centered on the most visually important region of your image.</div>
        </DialogShell>
      )}
      {paletteDialog && (
        <DialogShell title="Color palette" onCancel={() => setPaletteDialog(null)} onConfirm={() => setPaletteDialog(null)} confirmLabel="Close">
          <div className="grid grid-cols-3 gap-2">
            {paletteDialog.map((c, i) => (
              <button key={i} onClick={() => { setFgColor(c); navigator.clipboard?.writeText(c); toastFor(`${c} copied`); }} className="group flex flex-col items-center gap-1 rounded p-2 hover:bg-white/5">
                <div className="h-14 w-14 rounded-md border border-white/10 shadow" style={{ background: c }} />
                <span className="text-[10px] font-mono text-zinc-300">{c.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 text-center text-xs text-zinc-500">Click to set as foreground · auto-copied to clipboard</div>
        </DialogShell>
      )}
      {textEditOpen && textEditing && (
        <TextEditDialog
          layer={textEditing}
          fonts={FONTS}
          onCancel={() => setTextEditOpen(null)}
          onSave={(mut) => { updateLayer(textEditOpen, mut, 'text edit'); setTextEditOpen(null); }}
        />
      )}
    </StudioShell>
  );
}

function LayerStylesPanelUI({ styles, onChange }: { styles: LayerStyles; onChange: (s: LayerStyles) => void }) {
  return (
    <div className="space-y-3">
      <StyleSection
        label="Shadow"
        enabled={!!styles.shadow?.enabled}
        onToggle={(on) => onChange({ ...styles, shadow: on ? { ...DEFAULT_SHADOW, enabled: true } : { ...DEFAULT_SHADOW } })}
      >
        {styles.shadow?.enabled && (
          <ShadowControls
            value={styles.shadow}
            onChange={(s) => onChange({ ...styles, shadow: s })}
          />
        )}
      </StyleSection>
      <StyleSection
        label="Glow"
        enabled={!!styles.glow?.enabled}
        onToggle={(on) => onChange({ ...styles, glow: on ? { ...DEFAULT_GLOW, enabled: true } : { ...DEFAULT_GLOW } })}
      >
        {styles.glow?.enabled && (
          <GlowControls
            value={styles.glow}
            onChange={(s) => onChange({ ...styles, glow: s })}
          />
        )}
      </StyleSection>
      <StyleSection
        label="Stroke"
        enabled={!!styles.stroke?.enabled}
        onToggle={(on) => onChange({ ...styles, stroke: on ? { ...DEFAULT_STROKE, enabled: true } : { ...DEFAULT_STROKE } })}
      >
        {styles.stroke?.enabled && (
          <StrokeControls
            value={styles.stroke}
            onChange={(s) => onChange({ ...styles, stroke: s })}
          />
        )}
      </StyleSection>
    </div>
  );
}

function StyleSection({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={cn('rounded border p-2', enabled ? 'border-cyan-400/30 bg-cyan-500/5' : 'border-white/10 bg-white/[.02]')}>
      <label className="flex items-center gap-2 text-xs text-zinc-200">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="accent-cyan-400" />
        <span className="font-medium">{label}</span>
      </label>
      {children && <div className="mt-2 space-y-1.5">{children}</div>}
    </div>
  );
}

function ShadowControls({ value, onChange }: { value: LayerShadow; onChange: (v: LayerShadow) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-6 w-6 rounded border border-white/10 bg-transparent" />
        <StudioSlider label="Opacity" value={Math.round(value.opacity * 100)} min={0} max={100} onChange={(v) => onChange({ ...value, opacity: v / 100 })} suffix="%" />
      </div>
      <StudioSlider label="Blur" value={value.blur} min={0} max={80} onChange={(v) => onChange({ ...value, blur: v })} suffix="px" />
      <StudioSlider label="Offset X" value={value.offsetX} min={-40} max={40} onChange={(v) => onChange({ ...value, offsetX: v })} suffix="px" />
      <StudioSlider label="Offset Y" value={value.offsetY} min={-40} max={40} onChange={(v) => onChange({ ...value, offsetY: v })} suffix="px" />
    </>
  );
}

function GlowControls({ value, onChange }: { value: LayerGlow; onChange: (v: LayerGlow) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-6 w-6 rounded border border-white/10 bg-transparent" />
        <StudioSlider label="Opacity" value={Math.round(value.opacity * 100)} min={0} max={100} onChange={(v) => onChange({ ...value, opacity: v / 100 })} suffix="%" />
      </div>
      <StudioSlider label="Blur" value={value.blur} min={0} max={100} onChange={(v) => onChange({ ...value, blur: v })} suffix="px" />
      <StudioSlider label="Spread" value={value.spread} min={0} max={20} onChange={(v) => onChange({ ...value, spread: v })} suffix="" />
    </>
  );
}

function StrokeControls({ value, onChange }: { value: LayerStroke; onChange: (v: LayerStroke) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-6 w-6 rounded border border-white/10 bg-transparent" />
        <select value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value as any })} className="flex-1 rounded border border-white/10 bg-[#0a0b0e] px-2 py-1 text-xs text-zinc-100">
          <option value="outside">Outside</option>
          <option value="inside">Inside</option>
          <option value="center">Center</option>
        </select>
      </div>
      <StudioSlider label="Width" value={value.width} min={1} max={30} onChange={(v) => onChange({ ...value, width: v })} suffix="px" />
    </>
  );
}

function ToolOptionsBar(props: {
  tool: ToolKind;
  brushSize: number; setBrushSize: (n: number) => void;
  brushHard: number; setBrushHard: (n: number) => void;
  brushOpacity: number; setBrushOpacity: (n: number) => void;
  brushFlow: number; setBrushFlow: (n: number) => void;
  eraserSize: number; setEraserSize: (n: number) => void;
  wandTol: number; setWandTol: (n: number) => void;
  fgColor: string; setFgColor: (c: string) => void;
  bgColor: string; setBgColor: (c: string) => void;
  textSettings: any; setTextSettings: (t: any) => void;
  shapeSettings: any; setShapeSettings: (t: any) => void;
  onFilter: (k: 'blur' | 'sharpen' | 'noise' | 'pixelate' | 'posterize' | 'emboss' | 'edge') => void;
  onFlip: (a: 'h' | 'v') => void;
  onRotate: (deg: number) => void;
  onAddAdjustment: (k: AdjustmentLayer['adjustKind']) => void;
  onFitScreen: () => void;
  onClearSelection: () => void;
  hasSelection: boolean;
}) {
  const { tool } = props;
  const { mode } = useResponsiveStudio();
  const isMobile = mode !== 'desktop';
  // Phone: raw range inputs are ~6px tall with ungrabbable native thumbs and
  // would scroll the page on drag. Reuse the shell's .studio-range (taller,
  // 26px coarse-pointer thumb) + touch-action:none. Desktop keeps the original
  // bare inputs (rng === '') so its layout is byte-for-byte unchanged.
  const rng = isMobile ? 'studio-range h-2.5 appearance-none rounded-full bg-white/10 [touch-action:none]' : '';
  // Phone: finger-sized buttons (>=44px) that never shrink below content (so the
  // bar scrolls horizontally instead of squeezing). Desktop keeps the original
  // px-2 py-1 / p-1 with no shrink-0, so its flex behavior is unchanged.
  const btn = isMobile ? 'shrink-0 rounded px-3 py-2 min-h-[44px] hover:bg-white/5' : 'rounded px-2 py-1 hover:bg-white/5';
  const iconBtn = isMobile ? 'shrink-0 grid h-11 w-11 place-items-center rounded hover:bg-white/5' : 'rounded p-1 hover:bg-white/5';
  return (
    <div className={cn(
      'flex shrink-0 items-center gap-2 border-b border-white/5 bg-[#0f1115] px-3 text-xs text-zinc-300 overflow-x-auto',
      isMobile ? 'h-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'h-10',
    )}>
      {(tool === 'brush') && (
        <>
          <Label>Size</Label>
          <input type="range" min={1} max={400} value={props.brushSize} onChange={e => props.setBrushSize(+e.target.value)} className={cn('w-32', rng)} />
          <NumBadge>{props.brushSize}</NumBadge>
          <Label>Hardness</Label>
          <input type="range" min={0} max={100} value={props.brushHard} onChange={e => props.setBrushHard(+e.target.value)} className={cn('w-24', rng)} />
          <Label>Opacity</Label>
          <input type="range" min={1} max={100} value={props.brushOpacity} onChange={e => props.setBrushOpacity(+e.target.value)} className={cn('w-24', rng)} />
          <Label>Flow</Label>
          <input type="range" min={1} max={100} value={props.brushFlow} onChange={e => props.setBrushFlow(+e.target.value)} className={cn('w-24', rng)} />
        </>
      )}
      {tool === 'eraser' && (
        <>
          <Label>Size</Label>
          <input type="range" min={1} max={400} value={props.eraserSize} onChange={e => props.setEraserSize(+e.target.value)} className={cn('w-32', rng)} />
          <NumBadge>{props.eraserSize}</NumBadge>
        </>
      )}
      {tool === 'wand' && (
        <>
          <Label>Tolerance</Label>
          <input type="range" min={0} max={128} value={props.wandTol} onChange={e => props.setWandTol(+e.target.value)} className={cn('w-32', rng)} />
          <NumBadge>{props.wandTol}</NumBadge>
        </>
      )}
      {tool === 'bucket' && (
        <>
          <Label>Tolerance</Label>
          <input type="range" min={0} max={128} value={props.wandTol} onChange={e => props.setWandTol(+e.target.value)} className={cn('w-32', rng)} />
          <NumBadge>{props.wandTol}</NumBadge>
          <Swatch color={props.fgColor} onChange={props.setFgColor} />
        </>
      )}
      {tool === 'text' && (
        <>
          <select value={props.textSettings.font} onChange={e => props.setTextSettings({ ...props.textSettings, font: e.target.value })} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs">
            {['system-ui, sans-serif', 'Georgia, serif', 'Impact, sans-serif', 'Times New Roman, serif', 'Comic Sans MS, cursive', 'Courier New, monospace'].map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
          <input type="number" value={props.textSettings.size} onChange={e => props.setTextSettings({ ...props.textSettings, size: +e.target.value })} className="h-7 w-16 rounded border border-white/10 bg-[#0a0b0e] px-1.5" />
          <Swatch color={props.textSettings.color} onChange={c => props.setTextSettings({ ...props.textSettings, color: c })} />
          <button onClick={() => props.setTextSettings({ ...props.textSettings, weight: props.textSettings.weight >= 700 ? 400 : 700 })} className={cn('rounded px-2 py-1 font-bold', props.textSettings.weight >= 700 && 'bg-white/10')}>B</button>
          <button onClick={() => props.setTextSettings({ ...props.textSettings, italic: !props.textSettings.italic })} className={cn('rounded px-2 py-1 italic', props.textSettings.italic && 'bg-white/10')}>I</button>
          <button onClick={() => props.setTextSettings({ ...props.textSettings, outline: !props.textSettings.outline })} className={cn('rounded px-2 py-1', props.textSettings.outline && 'bg-white/10')}>Outline</button>
        </>
      )}
      {(tool === 'shape-rect' || tool === 'shape-ellipse') && (
        <>
          <Label>Fill</Label>
          <Swatch color={props.shapeSettings.fill} onChange={c => props.setShapeSettings({ ...props.shapeSettings, fill: c })} />
          <Label>Stroke</Label>
          <Swatch color={props.shapeSettings.stroke} onChange={c => props.setShapeSettings({ ...props.shapeSettings, stroke: c })} />
          <input type="number" value={props.shapeSettings.strokeWidth} onChange={e => props.setShapeSettings({ ...props.shapeSettings, strokeWidth: +e.target.value })} className="h-7 w-16 rounded border border-white/10 bg-[#0a0b0e] px-1.5" />
          {tool === 'shape-rect' && <>
            <Label>Radius</Label>
            <input type="number" value={props.shapeSettings.radius} onChange={e => props.setShapeSettings({ ...props.shapeSettings, radius: +e.target.value })} className="h-7 w-16 rounded border border-white/10 bg-[#0a0b0e] px-1.5" />
          </>}
        </>
      )}
      <div className="mx-1 h-5 w-px bg-white/10" />
      <button onClick={() => props.onFilter('blur')} className={btn}>Blur</button>
      <button onClick={() => props.onFilter('sharpen')} className={btn}>Sharpen</button>
      <button onClick={() => props.onFilter('noise')} className={btn}>Noise</button>
      <button onClick={() => props.onFilter('pixelate')} className={btn}>Pixelate</button>
      <button onClick={() => props.onFilter('posterize')} className={btn}>Posterize</button>
      <button onClick={() => props.onFilter('emboss')} className={btn}>Emboss</button>
      <button onClick={() => props.onFilter('edge')} className={btn}>Edges</button>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <button onClick={() => props.onFlip('h')} className={iconBtn} title="Flip H"><FlipHorizontal2 className="h-3.5 w-3.5" /></button>
      <button onClick={() => props.onFlip('v')} className={iconBtn} title="Flip V"><FlipVertical2 className="h-3.5 w-3.5" /></button>
      <button onClick={() => props.onRotate(90)} className={iconBtn} title="Rotate 90°"><RotateCw className="h-3.5 w-3.5" /></button>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <button onClick={props.onFitScreen} className={btn}>Fit</button>
      {props.hasSelection && (
        <button onClick={props.onClearSelection} className={cn(btn, 'text-cyan-300')}>Deselect</button>
      )}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <span className="text-zinc-500">{children}</span>;
const NumBadge = ({ children }: { children: React.ReactNode }) => <span className="rounded bg-white/5 px-1.5 text-[10px] tabular-nums text-zinc-300">{children}</span>;
const Swatch = ({ color, onChange }: { color: string; onChange: (c: string) => void }) => (
  <label className="relative inline-block h-5 w-5 cursor-pointer rounded border border-white/20" style={{ background: color }}>
    <input type="color" value={color} onChange={e => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
  </label>
);

function LayerRow({ layer, active, onSelect, onToggle, onLock, onRename, onDoubleClick }: {
  layer: Layer; active: boolean; onSelect: () => void; onToggle: () => void; onLock: () => void; onRename: (n: string) => void; onDoubleClick?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(layer.name);
  React.useEffect(() => setName(layer.name), [layer.name]);
  const icon = layer.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5" />
    : layer.kind === 'paint' ? <Brush className="h-3.5 w-3.5" />
    : layer.kind === 'text' ? <TypeIcon className="h-3.5 w-3.5" />
    : layer.kind === 'shape' ? <Square className="h-3.5 w-3.5" />
    : <Sparkles className="h-3.5 w-3.5" />;
  return (
    <div
      onClick={onSelect}
      onDoubleClick={() => { setEditing(true); onDoubleClick?.(); }}
      className={cn(
        'group flex items-center gap-1.5 rounded px-2 py-1.5 cursor-pointer',
        active ? 'bg-cyan-500/15 ring-1 ring-cyan-400/40' : 'hover:bg-white/5',
      )}
    >
      <button onClick={e => { e.stopPropagation(); onToggle(); }} className="text-zinc-400 hover:text-white">
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <div className="text-zinc-500">{icon}</div>
      {editing ? (
        <input
          autoFocus value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { setEditing(false); onRename(name); }}
          onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onRename(name); } }}
          className="flex-1 rounded bg-black/30 px-1 text-xs outline-none"
        />
      ) : (
        <div className="flex-1 truncate text-xs text-zinc-200">{layer.name}</div>
      )}
      <button onClick={e => { e.stopPropagation(); onLock(); }} className="text-zinc-500 opacity-0 hover:text-white group-hover:opacity-100">
        {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      </button>
    </div>
  );
}

function LayerPropsPanel({ layer, onChange }: { layer: Layer; onChange: (mut: (l: Layer) => void) => void }) {
  return (
    <StudioPanel title="Layer">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Blend</span>
          <StudioSelect
            value={layer.blend}
            options={BLEND_LIST.map(b => ({ value: b.value, label: b.label }))}
            onChange={v => onChange(l => { l.blend = v as BlendMode; })}
          />
        </div>
        <StudioSlider label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} onChange={v => onChange(l => { l.opacity = v / 100; })} suffix="%" />
        {(layer.kind === 'paint' || layer.kind === 'image') && (
          <>
            <StudioSlider label="Brightness" value={layer.adjust.brightness} min={0} max={300} onChange={v => onChange(l => { l.adjust.brightness = v; })} suffix="%" />
            <StudioSlider label="Contrast" value={layer.adjust.contrast} min={0} max={300} onChange={v => onChange(l => { l.adjust.contrast = v; })} suffix="%" />
            <StudioSlider label="Saturation" value={layer.adjust.saturate} min={0} max={300} onChange={v => onChange(l => { l.adjust.saturate = v; })} suffix="%" />
            <StudioSlider label="Hue" value={layer.adjust.hue} min={-180} max={180} onChange={v => onChange(l => { l.adjust.hue = v; })} suffix="°" />
            <StudioSlider label="Blur" value={layer.adjust.blur} min={0} max={50} onChange={v => onChange(l => { l.adjust.blur = v; })} suffix="px" />
          </>
        )}
        {layer.kind === 'image' && (
          <>
            <StudioSlider label="Rotate" value={layer.rotation} min={-180} max={180} onChange={v => onChange(l => { (l as ImageLayer).rotation = v; })} suffix="°" />
            <StudioSlider label="Scale" value={Math.round(layer.scaleX * 100)} min={5} max={400} onChange={v => onChange(l => { (l as ImageLayer).scaleX = v / 100; (l as ImageLayer).scaleY = v / 100; })} suffix="%" />
          </>
        )}
      </div>
    </StudioPanel>
  );
}

function AdjustmentEditor({ layer, onChange, onCurveSet }: { layer: AdjustmentLayer; onChange: (params: Record<string, number>) => void; onCurveSet: (cs: CurveSet) => void }) {
  const p = { ...layer.params };
  const set = (k: string, v: number) => onChange({ ...p, [k]: v });
  return (
    <StudioPanel title={layer.name}>
      <div className="space-y-3">
        {layer.adjustKind === 'bright-contrast' && (
          <>
            <StudioSlider label="Brightness" value={p.brightness ?? 100} min={0} max={300} onChange={v => set('brightness', v)} suffix="%" />
            <StudioSlider label="Contrast" value={p.contrast ?? 100} min={0} max={300} onChange={v => set('contrast', v)} suffix="%" />
          </>
        )}
        {layer.adjustKind === 'hue-sat' && (
          <>
            <StudioSlider label="Hue" value={p.hue ?? 0} min={-180} max={180} onChange={v => set('hue', v)} suffix="°" />
            <StudioSlider label="Saturation" value={p.saturate ?? 100} min={0} max={300} onChange={v => set('saturate', v)} suffix="%" />
            <StudioSlider label="Lightness" value={p.lightness ?? 100} min={0} max={300} onChange={v => set('lightness', v)} suffix="%" />
          </>
        )}
        {layer.adjustKind === 'levels' && (
          <>
            <StudioSlider label="Black In" value={p.blackIn ?? 0} min={0} max={255} onChange={v => set('blackIn', v)} />
            <StudioSlider label="White In" value={p.whiteIn ?? 255} min={0} max={255} onChange={v => set('whiteIn', v)} />
            <StudioSlider label="Gamma" value={Math.round((p.gamma ?? 1) * 100)} min={10} max={300} onChange={v => set('gamma', v / 100)} />
            <StudioSlider label="Black Out" value={p.blackOut ?? 0} min={0} max={255} onChange={v => set('blackOut', v)} />
            <StudioSlider label="White Out" value={p.whiteOut ?? 255} min={0} max={255} onChange={v => set('whiteOut', v)} />
          </>
        )}
        {layer.adjustKind === 'curves' && (
          <RgbCurvesPanel
            value={layer.curveSet ?? { master: { points: [...IDENTITY_CURVE.points] } }}
            onChange={onCurveSet}
            title="Curves"
          />
        )}
        {layer.adjustKind === 'color-balance' && (
          <>
            <StudioSlider label="Red ←→ Cyan" value={p.r ?? 0} min={-128} max={128} onChange={v => set('r', v)} color="#ef4444" />
            <StudioSlider label="Green ←→ Mag" value={p.g ?? 0} min={-128} max={128} onChange={v => set('g', v)} color="#22c55e" />
            <StudioSlider label="Blue ←→ Yel" value={p.b ?? 0} min={-128} max={128} onChange={v => set('b', v)} color="#3b82f6" />
          </>
        )}
      </div>
    </StudioPanel>
  );
}

function HistoryList({ stack, onJump }: { stack: UndoStack<DocState>; onJump: (i: number) => void }) {
  const hist = stack.history();
  return (
    <div className="space-y-0.5">
      {hist.past.map((label, i) => {
        const isCurrent = i === hist.past.length - 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => { if (!isCurrent) onJump(i); }}
            disabled={isCurrent}
            title={isCurrent ? 'Current state' : `Jump to: ${label}`}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition',
              isCurrent ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
            )}
          >
            <span className="text-zinc-500">{i + 1}.</span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
      {hist.future.length > 0 && <div className="my-1 h-px bg-white/5" />}
      {hist.future.map((label, i) => (
        <div key={'f' + i} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-600" title="Redo to reach this state">
          <span>{hist.past.length + i + 1}.</span>
          <span className="truncate">{label}</span>
        </div>
      ))}
    </div>
  );
}

function NewDocDialog({ onCancel, onCreate }: { onCancel: () => void; onCreate: (w: number, h: number, name: string, bg: 'transparent' | string) => void }) {
  const [w, setW] = React.useState(1920);
  const [h, setH] = React.useState(1080);
  const [name, setName] = React.useState('Untitled');
  const [bg, setBg] = React.useState<'transparent' | string>('#ffffff');
  const presets = [
    { name: 'HD (1920×1080)', w: 1920, h: 1080 }, { name: '4K (3840×2160)', w: 3840, h: 2160 },
    { name: 'Square (1080×1080)', w: 1080, h: 1080 }, { name: 'Story (1080×1920)', w: 1080, h: 1920 },
    { name: 'A4 @ 150 dpi', w: 1240, h: 1754 }, { name: 'YouTube Thumb', w: 1280, h: 720 },
  ];
  return (
    <DialogShell title="New Document" onCancel={onCancel} onConfirm={() => onCreate(w, h, name, bg)} confirmLabel="Create">
      <div className="space-y-3">
        <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width"><input type="number" value={w} onChange={e => setW(+e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="Height"><input type="number" value={h} onChange={e => setH(+e.target.value)} className={INPUT_CLS} /></Field>
        </div>
        <Field label="Background">
          <div className="flex items-center gap-2">
            <input type="color" value={bg === 'transparent' ? '#ffffff' : bg} onChange={e => setBg(e.target.value)} className="h-8 w-12 rounded border border-white/10" />
            <button onClick={() => setBg('transparent')} className={cn('rounded px-2 py-1 text-xs', bg === 'transparent' ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-zinc-300')}>Transparent</button>
            <button onClick={() => setBg('#ffffff')} className={cn('rounded px-2 py-1 text-xs', bg === '#ffffff' ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-zinc-300')}>White</button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-1">
          {presets.map(p => (
            <button key={p.name} onClick={() => { setW(p.w); setH(p.h); }} className="rounded bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10">{p.name}</button>
          ))}
        </div>
      </div>
    </DialogShell>
  );
}

function ExportDialog({ fmt, setFmt, q, setQ, onCancel, onExport, onPsd, layerCount }: { fmt: ImageFormat; setFmt: (f: ImageFormat) => void; q: number; setQ: (n: number) => void; onCancel: () => void; onExport: () => void; onPsd?: () => void; layerCount?: number }) {
  return (
    <DialogShell title="Export" onCancel={onCancel} onConfirm={onExport} confirmLabel="Download">
      <div className="space-y-3">
        <Field label="Format">
          <div className="flex gap-1">
            {(['png', 'jpeg', 'webp'] as ImageFormat[]).map(f => (
              <button key={f} onClick={() => setFmt(f)} className={cn('rounded px-3 py-1.5 text-xs uppercase', fmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
            ))}
          </div>
        </Field>
        {fmt !== 'png' && (
          <Field label={`Quality ${q}%`}>
            <input type="range" min={10} max={100} value={q} onChange={e => setQ(+e.target.value)} className="w-full" />
          </Field>
        )}
        {onPsd && (
          <div className="border-t border-white/10 pt-2">
            <button onClick={onPsd} className="w-full rounded bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">Export layered .PSD ({layerCount ?? 0} layer{layerCount === 1 ? '' : 's'}) — opens in Photoshop/Affinity</button>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function FilterDialog({ kind, value, setValue, onCancel, onApply }: {
  kind: 'blur' | 'sharpen' | 'noise' | 'pixelate' | 'posterize' | 'emboss' | 'edge';
  value: number; setValue: (n: number) => void; onCancel: () => void; onApply: (v: number) => void;
}) {
  const ranges: Record<typeof kind, [number, number, string]> = {
    blur: [0, 50, 'radius'],
    sharpen: [1, 10, 'amount'],
    noise: [0, 80, 'amount'],
    pixelate: [2, 80, 'block'],
    posterize: [2, 12, 'levels'],
    emboss: [1, 5, 'amount'],
    edge: [1, 5, 'amount'],
  };
  const [min, max, label] = ranges[kind];
  return (
    <DialogShell title={kind[0].toUpperCase() + kind.slice(1)} onCancel={onCancel} onConfirm={() => onApply(value)} confirmLabel="Apply">
      <Field label={`${label} (${value})`}>
        <input type="range" min={min} max={max} value={value} onChange={e => setValue(+e.target.value)} className="w-full" />
      </Field>
    </DialogShell>
  );
}

function OpenDialog({ items, onCancel, onPick }: { items: StudioProject[]; onCancel: () => void; onPick: (id: string) => void }) {
  return (
    <DialogShell title="Library" onCancel={onCancel} onConfirm={onCancel} confirmLabel="Close">
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {items.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects yet</div>}
        {items.map(p => (
          <button key={p.id} onClick={() => onPick(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </DialogShell>
  );
}

function TextEditDialog({ layer, fonts, onCancel, onSave }: { layer: TextLayer; fonts: string[]; onCancel: () => void; onSave: (mut: (l: Layer) => void) => void }) {
  const [t, setT] = React.useState({ ...layer });
  return (
    <DialogShell title="Text" wide onCancel={onCancel} onConfirm={() => onSave(l => { const tl = l as TextLayer; Object.assign(tl, t); })} confirmLabel="Apply">
      <div className="space-y-3">
        <Field label="Text">
          <textarea value={t.text} onChange={e => setT({ ...t, text: e.target.value })} rows={3} className={INPUT_CLS} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Font">
            <select value={t.font} onChange={e => setT({ ...t, font: e.target.value })} className={INPUT_CLS}>
              {fonts.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
            </select>
          </Field>
          <Field label="Size"><input type="number" value={t.size} onChange={e => setT({ ...t, size: +e.target.value })} className={INPUT_CLS} /></Field>
          <Field label="Color"><input type="color" value={t.color} onChange={e => setT({ ...t, color: e.target.value })} className="h-8 w-full rounded border border-white/10" /></Field>
          <Field label="Weight">
            <select value={t.weight} onChange={e => setT({ ...t, weight: +e.target.value })} className={INPUT_CLS}>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Line height"><input type="number" step={0.1} value={t.lineHeight} onChange={e => setT({ ...t, lineHeight: +e.target.value })} className={INPUT_CLS} /></Field>
          <Field label="Letter spacing"><input type="number" step={0.5} value={t.letterSpacing} onChange={e => setT({ ...t, letterSpacing: +e.target.value })} className={INPUT_CLS} /></Field>
        </div>
        <Field label="Align">
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as CanvasTextAlign[]).map(a => (
              <button key={a} onClick={() => setT({ ...t, align: a })} className={cn('rounded px-3 py-1.5 text-xs capitalize', t.align === a ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{a}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={t.outline} onChange={e => setT({ ...t, outline: e.target.checked })} /> Outline
          </label>
          {t.outline && (
            <div className="flex items-center gap-2">
              <input type="color" value={t.outlineColor} onChange={e => setT({ ...t, outlineColor: e.target.value })} className="h-7 w-10 rounded border border-white/10" />
              <input type="number" value={t.outlineWidth} onChange={e => setT({ ...t, outlineWidth: +e.target.value })} className={INPUT_CLS} />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={t.shadow} onChange={e => setT({ ...t, shadow: e.target.checked })} /> Shadow
          </label>
          {t.shadow && (
            <div className="flex items-center gap-2">
              <input type="color" value={t.shadowColor.startsWith('#') ? t.shadowColor : '#000000'} onChange={e => setT({ ...t, shadowColor: e.target.value })} className="h-7 w-10 rounded border border-white/10" />
              <input type="number" value={t.shadowBlur} onChange={e => setT({ ...t, shadowBlur: +e.target.value })} className={INPUT_CLS} />
            </div>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

const INPUT_CLS = 'w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1 text-xs text-zinc-400">
    <span>{label}</span>
    {children}
  </label>
);

function DialogShell({ title, children, onCancel, onConfirm, confirmLabel = 'OK', wide }: {
  title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string; wide?: boolean;
}) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width={wide ? 'lg' : 'sm'}>{children}</SharedDialog>;
}

function applyKernel(src: HTMLCanvasElement, kernel: number[], passes: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  let img = ctx.getImageData(0, 0, w, h);
  for (let p = 0; p < passes; p++) {
    const data = convolve3x3(img.data, w, h, kernel);
    const next = ctx.createImageData(w, h);
    next.data.set(data);
    img = next;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function pixelate(src: HTMLCanvasElement, block: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const tw = Math.max(1, Math.floor(w / block));
  const th = Math.max(1, Math.floor(h / block));
  const tiny = blankCanvas(tw, th);
  const tctx = tiny.getContext('2d')!;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(src, 0, 0, tw, th);
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, w, h);
  return out;
}

function posterize(src: HTMLCanvasElement, levels: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const step = 255 / (levels - 1);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.round(img.data[i] / step) * step;
    img.data[i + 1] = Math.round(img.data[i + 1] / step) * step;
    img.data[i + 2] = Math.round(img.data[i + 2] / step) * step;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function noise(src: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount * 2;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function bucketFill(target: HTMLCanvasElement, sx: number, sy: number, color: string, tolerance: number) {
  const w = target.width, h = target.height;
  const ctx = target.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const start = (sy * w + sx) * 4;
  const tr = data[start], tg = data[start + 1], tb = data[start + 2], ta = data[start + 3];
  const [fr, fg, fb] = hexToRgb(color);
  if (tr === fr && tg === fg && tb === fb && ta === 255) return;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  const tol2 = tolerance * tolerance * 3;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const k = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || seen[k]) continue;
    const o = k * 4;
    const dr = data[o] - tr, dg = data[o + 1] - tg, db = data[o + 2] - tb;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    seen[k] = 1;
    data[o] = fr; data[o + 1] = fg; data[o + 2] = fb; data[o + 3] = 255;
    stack.push(x + 1, y); stack.push(x - 1, y);
    stack.push(x, y + 1); stack.push(x, y - 1);
  }
  ctx.putImageData(img, 0, 0);
}

interface SerializedLayerBase { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blend: BlendMode; adjust: AdjustParams; maskUrl?: string }
interface SerializedImageLayer extends SerializedLayerBase { kind: 'image'; canvasUrl: string; x: number; y: number; scaleX: number; scaleY: number; rotation: number }
interface SerializedPaintLayer extends SerializedLayerBase { kind: 'paint'; canvasUrl: string }
interface SerializedTextLayer extends SerializedLayerBase { kind: 'text'; text: string; x: number; y: number; size: number; color: string; font: string; weight: number; italic: boolean; align: CanvasTextAlign; letterSpacing: number; lineHeight: number; outline: boolean; outlineColor: string; outlineWidth: number; shadow: boolean; shadowBlur: number; shadowColor: string }
interface SerializedShapeLayer extends SerializedLayerBase { kind: 'shape'; shape: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; fill: string; stroke: string; strokeWidth: number; radius: number }
interface SerializedAdjustLayer extends SerializedLayerBase { kind: 'adjust'; adjustKind: AdjustmentLayer['adjustKind']; params: Record<string, number> }
type SerializedLayer = SerializedImageLayer | SerializedPaintLayer | SerializedTextLayer | SerializedShapeLayer | SerializedAdjustLayer;

interface SerializedDoc {
  name: string; width: number; height: number; background: 'transparent' | string;
  layers: SerializedLayer[]; activeId: string | null;
}

function serializeDoc(d: DocState): SerializedDoc {
  return {
    name: d.name, width: d.width, height: d.height, background: d.background,
    activeId: d.activeId,
    layers: d.layers.map(l => {
      const base = {
        id: l.id, name: l.name, visible: l.visible, locked: l.locked,
        opacity: l.opacity, blend: l.blend, adjust: { ...l.adjust },
        maskUrl: l.mask ? l.mask.toDataURL('image/png') : undefined,
      };
      if (l.kind === 'image') return { ...base, kind: 'image', canvasUrl: l.canvas.toDataURL('image/png'), x: l.x, y: l.y, scaleX: l.scaleX, scaleY: l.scaleY, rotation: l.rotation } as SerializedImageLayer;
      if (l.kind === 'paint') return { ...base, kind: 'paint', canvasUrl: l.canvas.toDataURL('image/png') } as SerializedPaintLayer;
      if (l.kind === 'text') return { ...base, kind: 'text', text: l.text, x: l.x, y: l.y, size: l.size, color: l.color, font: l.font, weight: l.weight, italic: l.italic, align: l.align, letterSpacing: l.letterSpacing, lineHeight: l.lineHeight, outline: l.outline, outlineColor: l.outlineColor, outlineWidth: l.outlineWidth, shadow: l.shadow, shadowBlur: l.shadowBlur, shadowColor: l.shadowColor } as SerializedTextLayer;
      if (l.kind === 'shape') return { ...base, kind: 'shape', shape: l.shape, x: l.x, y: l.y, w: l.w, h: l.h, fill: l.fill, stroke: l.stroke, strokeWidth: l.strokeWidth, radius: l.radius } as SerializedShapeLayer;
      return { ...base, kind: 'adjust', adjustKind: l.adjustKind, params: { ...l.params } } as SerializedAdjustLayer;
    }),
  };
}

async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
  const c = blankCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

async function deserializeDoc(s: SerializedDoc): Promise<DocState> {
  const layers: Layer[] = [];
  for (const sl of s.layers) {
    const baseRest = { id: sl.id, name: sl.name, visible: sl.visible, locked: sl.locked, opacity: sl.opacity, blend: sl.blend, adjust: { ...sl.adjust } };
    let mask: HTMLCanvasElement | undefined;
    if (sl.maskUrl) mask = await urlToCanvas(sl.maskUrl);
    if (sl.kind === 'image') {
      layers.push({ ...baseRest, kind: 'image', mask, canvas: await urlToCanvas(sl.canvasUrl), x: sl.x, y: sl.y, scaleX: sl.scaleX, scaleY: sl.scaleY, rotation: sl.rotation });
    } else if (sl.kind === 'paint') {
      layers.push({ ...baseRest, kind: 'paint', mask, canvas: await urlToCanvas(sl.canvasUrl) });
    } else if (sl.kind === 'text') {
      layers.push({ ...baseRest, kind: 'text', mask, text: sl.text, x: sl.x, y: sl.y, size: sl.size, color: sl.color, font: sl.font, weight: sl.weight, italic: sl.italic, align: sl.align, letterSpacing: sl.letterSpacing, lineHeight: sl.lineHeight, outline: sl.outline, outlineColor: sl.outlineColor, outlineWidth: sl.outlineWidth, shadow: sl.shadow, shadowBlur: sl.shadowBlur, shadowColor: sl.shadowColor });
    } else if (sl.kind === 'shape') {
      layers.push({ ...baseRest, kind: 'shape', mask, shape: sl.shape, x: sl.x, y: sl.y, w: sl.w, h: sl.h, fill: sl.fill, stroke: sl.stroke, strokeWidth: sl.strokeWidth, radius: sl.radius });
    } else {
      layers.push({ ...baseRest, kind: 'adjust', mask, adjustKind: sl.adjustKind, params: { ...sl.params } });
    }
  }
  return { name: s.name, width: s.width, height: s.height, background: s.background, layers, activeId: s.activeId, selection: null };
}
