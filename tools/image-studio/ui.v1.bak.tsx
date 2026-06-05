'use client';

import * as React from 'react';
import {
  Loader2, Download, Undo2, Redo2, Image as ImageIcon, Type, Brush, Eraser,
  Square, Circle, Move, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Plus,
  Crop, Wand2, Copy, ZoomIn, ZoomOut, Maximize, Droplets, Stamp, Sparkles, Bandage,
  Pipette, FlipHorizontal2, FlipVertical2, RotateCw, PaintBucket, Layers, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';
import { removeBackground as removeBgEngine } from '@/engines/image';

// ---- model -----------------------------------------------------------------
type Tool = 'move' | 'brush' | 'eraser' | 'text' | 'rect' | 'ellipse' | 'crop' | 'smooth' | 'clone' | 'heal' | 'eyedropper' | 'gradient';
type Blend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'difference';
interface Adjust { brightness: number; contrast: number; saturate: number; blur: number; hue: number; grayscale: number; sepia: number; invert: number }
const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0, invert: 0 };
const adjustToFilter = (a: Adjust) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg) grayscale(${a.grayscale}%) sepia(${a.sepia}%) invert(${a.invert}%) blur(${a.blur}px)`;

const PRESETS: { name: string; a: Partial<Adjust> }[] = [
  { name: 'Original', a: {} },
  { name: 'B&W', a: { grayscale: 100, contrast: 110 } },
  { name: 'Vintage', a: { sepia: 45, contrast: 105, saturate: 85 } },
  { name: 'Cool', a: { hue: -18, saturate: 115, brightness: 102 } },
  { name: 'Warm', a: { sepia: 22, saturate: 120, brightness: 104 } },
  { name: 'Punch', a: { contrast: 132, saturate: 145 } },
  { name: 'Fade', a: { contrast: 88, brightness: 108, saturate: 80 } },
  { name: 'Noir', a: { grayscale: 100, contrast: 150, brightness: 95 } },
  { name: 'Clarendon', a: { contrast: 120, saturate: 135, brightness: 105 } },
  { name: 'Gingham', a: { brightness: 105, contrast: 90, sepia: 12 } },
  { name: 'Lo-Fi', a: { contrast: 140, saturate: 130 } },
  { name: 'Film', a: { contrast: 108, saturate: 92, sepia: 14, brightness: 102 } },
  { name: 'Golden', a: { sepia: 30, saturate: 130, brightness: 106, hue: -8 } },
  { name: 'Teal', a: { hue: 12, saturate: 120, contrast: 112 } },
  { name: 'Pastel', a: { saturate: 78, brightness: 110, contrast: 92 } },
  { name: 'Dramatic', a: { contrast: 150, saturate: 110, brightness: 96 } },
  { name: 'Matte', a: { contrast: 84, saturate: 88, brightness: 106, sepia: 8 } },
  { name: 'Moody', a: { contrast: 122, saturate: 80, brightness: 92, hue: -6 } },
  { name: 'Sunset', a: { sepia: 24, saturate: 140, brightness: 104, hue: -14 } },
  { name: 'Frost', a: { hue: 8, saturate: 95, brightness: 108, contrast: 105 } },
];

interface BaseLayer { id: string; name: string; visible: boolean; opacity: number; blend: Blend; adjust: Adjust; rotation?: number }
interface ImageLayer extends BaseLayer { kind: 'image'; canvas: HTMLCanvasElement; x: number; y: number; scale?: number; flipH?: boolean; flipV?: boolean }
interface PaintLayer extends BaseLayer { kind: 'paint'; canvas: HTMLCanvasElement }
interface TextLayer extends BaseLayer { kind: 'text'; text: string; x: number; y: number; size: number; color: string; weight: number; font?: string; align?: CanvasTextAlign; italic?: boolean; outline?: boolean; outlineColor?: string }
const FONTS = ['system-ui, sans-serif', 'Georgia, serif', 'Times New Roman, serif', 'Courier New, monospace', 'Impact, sans-serif', 'Comic Sans MS, cursive', 'Trebuchet MS, sans-serif'];
interface ShapeLayer extends BaseLayer { kind: 'shape'; shape: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string }
type Layer = ImageLayer | PaintLayer | TextLayer | ShapeLayer;

let _id = 0;
const nextId = () => `l${++_id}`;
const blankCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cloneCanvas = (s: HTMLCanvasElement) => { const c = blankCanvas(s.width, s.height); c.getContext('2d')!.drawImage(s, 0, 0); return c; };
function cloneLayer(l: Layer): Layer {
  const base = { ...l, adjust: { ...l.adjust } } as Layer;
  if (base.kind === 'paint') return { ...base, canvas: cloneCanvas(base.canvas) };
  return base;
}
const compositeOp = (b: Blend): GlobalCompositeOperation => (b === 'normal' ? 'source-over' : b);

type FilterKind = 'sharpen' | 'emboss' | 'pixelate' | 'posterize' | 'noise' | 'threshold';
function convolve(data: Uint8ClampedArray, w: number, h: number, k: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data); const half = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
        const px = Math.min(w - 1, Math.max(0, x + kx - half));
        const py = Math.min(h - 1, Math.max(0, y + ky - half));
        sum += data[(py * w + px) * 4 + c] * k[ky * 3 + kx];
      }
      out[(y * w + x) * 4 + c] = sum;
    }
  }
  return out;
}
function applyFilterToCanvas(src: HTMLCanvasElement, kind: FilterKind): HTMLCanvasElement {
  const c = blankCanvas(src.width, src.height); const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0);
  const w = c.width, h = c.height;
  if (kind === 'pixelate') {
    const b = Math.max(4, Math.round(Math.min(w, h) / 80));
    const t = blankCanvas(Math.max(1, Math.ceil(w / b)), Math.max(1, Math.ceil(h / b)));
    t.getContext('2d')!.drawImage(src, 0, 0, t.width, t.height);
    ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, 0, 0, w, h); ctx.imageSmoothingEnabled = true;
    return c;
  }
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  if (kind === 'sharpen') d.set(convolve(d, w, h, [0, -1, 0, -1, 5, -1, 0, -1, 0]));
  else if (kind === 'emboss') d.set(convolve(d, w, h, [-2, -1, 0, -1, 1, 1, 0, 1, 2]));
  else if (kind === 'posterize') { const step = 255 / 3; for (let i = 0; i < d.length; i += 4) { d[i] = Math.round(d[i] / step) * step; d[i + 1] = Math.round(d[i + 1] / step) * step; d[i + 2] = Math.round(d[i + 2] / step) * step; } }
  else if (kind === 'noise') { for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 64; d[i] += n; d[i + 1] += n; d[i + 2] += n; } }
  else if (kind === 'threshold') { for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const v = l > 128 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }
  ctx.putImageData(img, 0, 0); return c;
}

export default function ImageStudioTool() {
  const [w, setW] = React.useState(0);
  const [h, setH] = React.useState(0);
  const [layers, setLayers] = React.useState<Layer[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<Tool>('move');
  const [brushSize, setBrushSize] = React.useState(24);
  const [brushColor, setBrushColor] = React.useState('#ff3366');
  const [grad2, setGrad2] = React.useState('#22d3ee');
  const [zoom, setZoom] = React.useState(1);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [format, setFormat] = React.useState<'png' | 'jpg' | 'webp'>('png');
  const [editingName, setEditingName] = React.useState<string | null>(null);
  const [cropRect, setCropRect] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [effects, setEffects] = React.useState({ vignette: 0, grain: 0 });
  const [retouch, setRetouch] = React.useState(55); // retouch strength %

  const flatRef = React.useRef<HTMLCanvasElement | null>(null);   // flattened composite (retouch source)
  const blurRef = React.useRef<HTMLCanvasElement | null>(null);   // blurred composite (smooth/heal source)
  const grainRef = React.useRef<HTMLCanvasElement | null>(null);  // cached noise tile
  const cloneSrc = React.useRef<{ x: number; y: number } | null>(null);
  const cloneOff = React.useRef<{ x: number; y: number } | null>(null);
  const undoStack = React.useRef<Layer[][]>([]);
  const redoStack = React.useRef<Layer[][]>([]);
  const [, force] = React.useReducer((x) => x + 1, 0);
  const displayRef = React.useRef<HTMLCanvasElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const drag = React.useRef<{ x: number; y: number; lx: number; ly: number } | null>(null);
  const stroke = React.useRef<{ px: number; py: number } | null>(null);
  const shapeDraft = React.useRef<{ x0: number; y0: number; layerId: string } | null>(null);
  const cropDraft = React.useRef<{ x0: number; y0: number } | null>(null);
  const gradLayer = React.useRef<PaintLayer | null>(null);
  const { guard, gate } = useUsageGate('image');

  const selLayer = layers.find((l) => l.id === sel) || null;

  // ---- history -------------------------------------------------------------
  const snapshot = React.useCallback(() => {
    undoStack.current.push(layers.map(cloneLayer));
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = []; force();
  }, [layers]);
  const undo = React.useCallback(() => {
    const prev = undoStack.current.pop(); if (!prev) return;
    redoStack.current.push(layers.map(cloneLayer)); setLayers(prev); force();
  }, [layers]);
  const redo = React.useCallback(() => {
    const next = redoStack.current.pop(); if (!next) return;
    undoStack.current.push(layers.map(cloneLayer)); setLayers(next); force();
  }, [layers]);

  // ---- render --------------------------------------------------------------
  const paintLayers = React.useCallback((ctx: CanvasRenderingContext2D, forExport: boolean) => {
    for (const l of layers) {
      if (!l.visible) continue;
      ctx.save();
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = compositeOp(l.blend);
      ctx.filter = adjustToFilter(l.adjust);
      const rot = ((l.rotation ?? 0) * Math.PI) / 180;
      if (l.kind === 'image') {
        const cw = l.canvas.width, ch = l.canvas.height, sc = l.scale ?? 1;
        ctx.translate(l.x + cw / 2, l.y + ch / 2); ctx.rotate(rot); ctx.scale((l.flipH ? -1 : 1) * sc, (l.flipV ? -1 : 1) * sc);
        ctx.drawImage(l.canvas, -cw / 2, -ch / 2);
      } else if (l.kind === 'paint') ctx.drawImage(l.canvas, 0, 0);
      else if (l.kind === 'text') {
        ctx.translate(l.x, l.y); ctx.rotate(rot);
        ctx.font = `${l.italic ? 'italic ' : ''}${l.weight} ${l.size}px ${l.font || 'system-ui, sans-serif'}`;
        ctx.textBaseline = 'top'; ctx.textAlign = l.align || 'left';
        if (l.outline) { ctx.strokeStyle = l.outlineColor || '#000000'; ctx.lineWidth = Math.max(2, l.size * 0.06); ctx.lineJoin = 'round'; ctx.strokeText(l.text, 0, 0); }
        ctx.fillStyle = l.color; ctx.fillText(l.text, 0, 0);
      } else if (l.kind === 'shape') {
        ctx.fillStyle = l.color;
        if (l.shape === 'rect') ctx.fillRect(l.x, l.y, l.w, l.h);
        else { ctx.beginPath(); ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, Math.abs(l.w / 2), Math.abs(l.h / 2), 0, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    // ---- global effects (vignette + grain) ----
    if (effects.vignette > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${effects.vignette / 100})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (effects.grain > 0) {
      if (!grainRef.current) {
        const n = blankCanvas(140, 140); const nc = n.getContext('2d')!; const img = nc.createImageData(140, 140);
        for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 135; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        nc.putImageData(img, 0, 0); grainRef.current = n;
      }
      ctx.save(); ctx.globalAlpha = effects.grain / 150; ctx.globalCompositeOperation = 'overlay';
      for (let y = 0; y < h; y += 140) for (let x = 0; x < w; x += 140) ctx.drawImage(grainRef.current, x, y);
      ctx.restore();
    }
    if (!forExport && cropRect) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, w, cropRect.y); ctx.fillRect(0, cropRect.y + cropRect.h, w, h - cropRect.y - cropRect.h);
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h); ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, w - cropRect.x - cropRect.w, cropRect.h);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / zoom; ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    }
  }, [layers, w, h, cropRect, zoom, effects]);

  const render = React.useCallback(() => {
    const cv = displayRef.current; if (!cv || !w) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    paintLayers(ctx, false);
  }, [paintLayers, w, h]);
  React.useEffect(() => { render(); }, [render]);

  // ---- load ----------------------------------------------------------------
  const loadImage = async (file: File) => {
    if (!(await guard({ bytes: file.size }))) return;
    try {
      const bmp = await createImageBitmap(file);
      const cap = 2400; const scale = Math.min(1, cap / Math.max(bmp.width, bmp.height));
      const iw = Math.round(bmp.width * scale), ih = Math.round(bmp.height * scale);
      const c = blankCanvas(iw, ih); c.getContext('2d')!.drawImage(bmp, 0, 0, iw, ih); bmp.close();
      const first = !w;
      if (first) { setW(iw); setH(ih); }
      const layer: ImageLayer = { id: nextId(), kind: 'image', name: file.name.slice(0, 18) || 'Image', visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, canvas: c, x: 0, y: 0 };
      undoStack.current.push(layers.map(cloneLayer)); redoStack.current = [];
      setLayers((ls) => [...ls, layer]); setSel(layer.id); setError('');
    } catch { setError('Could not open this image.'); }
  };

  // ---- pointer -------------------------------------------------------------
  const toCanvas = (e: React.PointerEvent) => {
    const cv = displayRef.current!; const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const ensurePaint = (): PaintLayer => {
    const existing = (selLayer?.kind === 'paint' ? selLayer : layers.find((l) => l.kind === 'paint')) as PaintLayer | undefined;
    if (existing) return existing;
    const layer: PaintLayer = { id: nextId(), kind: 'paint', name: 'Paint', visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, canvas: blankCanvas(w, h) };
    setLayers((ls) => [...ls, layer]); setSel(layer.id);
    return layer;
  };
  const dab = (layer: PaintLayer, x0: number, y0: number, x1: number, y1: number) => {
    const ctx = layer.canvas.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    render();
  };

  // ---- retouch (smooth / clone / heal) -------------------------------------
  const prepareRetouchSource = (blurPx: number) => {
    const flat = blankCanvas(w, h); paintLayers(flat.getContext('2d')!, true); flatRef.current = flat;
    if (blurPx > 0) { const b = blankCanvas(w, h); const bctx = b.getContext('2d')!; bctx.filter = `blur(${blurPx}px)`; bctx.drawImage(flat, 0, 0); bctx.filter = 'none'; blurRef.current = b; }
  };
  const retouchDab = (layer: PaintLayer, x: number, y: number) => {
    const r = brushSize / 2; const pctx = layer.canvas.getContext('2d')!;
    pctx.save(); pctx.beginPath(); pctx.arc(x, y, r, 0, Math.PI * 2); pctx.clip();
    if (tool === 'clone') { pctx.globalAlpha = 1; if (flatRef.current && cloneOff.current) pctx.drawImage(flatRef.current, cloneOff.current.x, cloneOff.current.y); }
    else { pctx.globalAlpha = tool === 'heal' ? 0.95 : retouch / 100; if (blurRef.current) pctx.drawImage(blurRef.current, 0, 0); }
    pctx.restore(); render();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!w) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (tool === 'eyedropper') {
      const dctx = displayRef.current?.getContext('2d'); if (!dctx) return;
      const d = dctx.getImageData(Math.max(0, Math.min(w - 1, Math.round(p.x))), Math.max(0, Math.min(h - 1, Math.round(p.y))), 1, 1).data;
      setBrushColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      return;
    }
    if (tool === 'brush' || tool === 'eraser') { snapshot(); const layer = ensurePaint(); stroke.current = { px: p.x, py: p.y }; dab(layer, p.x, p.y, p.x, p.y); drag.current = { x: p.x, y: p.y, lx: 0, ly: 0 }; }
    else if (tool === 'smooth' || tool === 'heal') { snapshot(); const layer = ensurePaint(); prepareRetouchSource(tool === 'heal' ? Math.max(8, brushSize * 0.7) : Math.max(3, brushSize * 0.35)); retouchDab(layer, p.x, p.y); drag.current = { x: p.x, y: p.y, lx: 0, ly: 0 }; }
    else if (tool === 'clone') {
      if (e.altKey || !cloneSrc.current) { cloneSrc.current = p; return; }
      snapshot(); const layer = ensurePaint(); prepareRetouchSource(0);
      cloneOff.current = { x: p.x - cloneSrc.current.x, y: p.y - cloneSrc.current.y };
      retouchDab(layer, p.x, p.y); drag.current = { x: p.x, y: p.y, lx: 0, ly: 0 };
    }
    else if (tool === 'gradient') {
      snapshot();
      const layer: PaintLayer = { id: nextId(), kind: 'paint', name: 'Gradient', visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, canvas: blankCanvas(w, h) };
      setLayers((ls) => [...ls, layer]); setSel(layer.id); gradLayer.current = layer; drag.current = { x: p.x, y: p.y, lx: 0, ly: 0 };
    }
    else if (tool === 'crop') { cropDraft.current = { x0: p.x, y0: p.y }; setCropRect({ x: p.x, y: p.y, w: 0, h: 0 }); }
    else if (tool === 'text') {
      snapshot();
      const layer: TextLayer = { id: nextId(), kind: 'text', name: 'Text', visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, text: 'Double-click to edit', x: p.x, y: p.y, size: Math.round(h * 0.07), color: brushColor, weight: 700 };
      setLayers((ls) => [...ls, layer]); setSel(layer.id); setTool('move');
    } else if (tool === 'rect' || tool === 'ellipse') {
      snapshot();
      const layer: ShapeLayer = { id: nextId(), kind: 'shape', shape: tool, name: tool, visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, x: p.x, y: p.y, w: 0, h: 0, color: brushColor };
      setLayers((ls) => [...ls, layer]); setSel(layer.id); shapeDraft.current = { x0: p.x, y0: p.y, layerId: layer.id };
    } else if (tool === 'move' && selLayer && (selLayer.kind === 'image' || selLayer.kind === 'text' || selLayer.kind === 'shape')) {
      snapshot(); drag.current = { x: p.x, y: p.y, lx: selLayer.x, ly: selLayer.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current && !shapeDraft.current && !cropDraft.current) return;
    const p = toCanvas(e);
    if ((tool === 'brush' || tool === 'eraser') && drag.current) {
      const layer = (layers.find((l) => l.kind === 'paint' && l.id === sel) ?? layers.find((l) => l.kind === 'paint')) as PaintLayer | undefined;
      if (layer && stroke.current) { dab(layer, stroke.current.px, stroke.current.py, p.x, p.y); stroke.current = { px: p.x, py: p.y }; }
    } else if ((tool === 'smooth' || tool === 'clone' || tool === 'heal') && drag.current) {
      const layer = (layers.find((l) => l.kind === 'paint' && l.id === sel) ?? layers.find((l) => l.kind === 'paint')) as PaintLayer | undefined;
      if (layer) retouchDab(layer, p.x, p.y);
    } else if (cropDraft.current) {
      const d = cropDraft.current; setCropRect({ x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) });
    } else if (shapeDraft.current) {
      const d = shapeDraft.current;
      setLayers((ls) => ls.map((l) => l.id === d.layerId && l.kind === 'shape' ? { ...l, x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) } : l));
    } else if (tool === 'move' && drag.current && selLayer && (selLayer.kind === 'image' || selLayer.kind === 'text' || selLayer.kind === 'shape')) {
      const nx = drag.current.lx + (p.x - drag.current.x), ny = drag.current.ly + (p.y - drag.current.y);
      setLayers((ls) => ls.map((l) => l.id === sel && 'x' in l ? { ...l, x: nx, y: ny } : l));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (tool === 'gradient' && drag.current && gradLayer.current) {
      const end = toCanvas(e); const ctx = gradLayer.current.canvas.getContext('2d')!;
      const g = ctx.createLinearGradient(drag.current.x, drag.current.y, end.x, end.y);
      g.addColorStop(0, brushColor); g.addColorStop(1, grad2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); render(); gradLayer.current = null;
    }
    drag.current = null; shapeDraft.current = null; stroke.current = null; cropDraft.current = null;
  };

  // ---- layer ops -----------------------------------------------------------
  const patch = (id: string, p: Partial<Layer>) => setLayers((ls) => ls.map((l) => l.id === id ? { ...l, ...p } as Layer : l));
  const moveLayer = (id: string, dir: -1 | 1) => setLayers((ls) => { const i = ls.findIndex((l) => l.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return ls; const n = [...ls]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const del = (id: string) => { snapshot(); setLayers((ls) => ls.filter((l) => l.id !== id)); if (sel === id) setSel(null); };
  const duplicate = (id: string) => { const l = layers.find((x) => x.id === id); if (!l) return; snapshot(); const c = { ...cloneLayer(l), id: nextId(), name: `${l.name} copy` }; setLayers((ls) => { const i = ls.findIndex((x) => x.id === id); const n = [...ls]; n.splice(i + 1, 0, c); return n; }); setSel(c.id); };
  const applyPreset = (a: Partial<Adjust>) => { if (!selLayer) return; patch(selLayer.id, { adjust: { ...NO_ADJUST, ...a } }); };
  const applyFilter = (kind: FilterKind) => {
    if (!selLayer || selLayer.kind !== 'image') return;
    snapshot();
    const nc = applyFilterToCanvas(selLayer.canvas, kind);
    setLayers((ls) => ls.map((l) => l.id === selLayer.id && l.kind === 'image' ? { ...l, canvas: nc } : l));
  };
  const flatten = () => {
    if (!layers.length || !w) return;
    snapshot();
    const out = blankCanvas(w, h); paintLayers(out.getContext('2d')!, true);
    const layer: ImageLayer = { id: nextId(), kind: 'image', name: 'Flattened', visible: true, opacity: 1, blend: 'normal', adjust: { ...NO_ADJUST }, canvas: out, x: 0, y: 0 };
    setLayers([layer]); setSel(layer.id);
  };

  const removeBg = async () => {
    if (!selLayer || selLayer.kind !== 'image') return;
    setBusy('Removing background…'); setError('');
    try {
      const src = selLayer.canvas;
      const blob: Blob = await new Promise((res, rej) => src.toBlob((b) => b ? res(b) : rej(new Error('x')), 'image/png'));
      const out = await removeBgEngine(blob, { format: 'image/png', quality: 'balanced' });
      const bmp = await createImageBitmap(out);
      const c = blankCanvas(bmp.width, bmp.height); c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
      snapshot();
      setLayers((ls) => ls.map((l) => l.id === selLayer.id && l.kind === 'image' ? { ...l, canvas: c } : l));
    } catch { setError('Background removal failed on this image.'); }
    finally { setBusy(''); }
  };

  const applyCrop = () => {
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8) { setCropRect(null); setTool('move'); return; }
    const { x: rx, y: ry, w: rw, h: rh } = { x: Math.round(cropRect.x), y: Math.round(cropRect.y), w: Math.round(cropRect.w), h: Math.round(cropRect.h) };
    snapshot();
    setLayers((ls) => ls.map((l) => {
      if (l.kind === 'paint') { const c = blankCanvas(rw, rh); c.getContext('2d')!.drawImage(l.canvas, -rx, -ry); return { ...l, canvas: c }; }
      if ('x' in l) return { ...l, x: l.x - rx, y: l.y - ry } as Layer;
      return l;
    }));
    setW(rw); setH(rh); setCropRect(null); setTool('move');
  };

  // ---- keyboard ------------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingName || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Delete' && sel) { del(sel); return; }
      const map: Record<string, Tool> = { v: 'move', m: 'move', b: 'brush', e: 'eraser', t: 'text', c: 'crop' };
      if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, sel, editingName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- export --------------------------------------------------------------
  const exportImage = async () => {
    if (!w || !(await guard())) return;
    setBusy('Exporting…'); setError('');
    try {
      const out = blankCanvas(w, h); const ctx = out.getContext('2d')!;
      if (format === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      paintLayers(ctx, true);
      const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const blob: Blob = await new Promise((res, rej) => out.toBlob((b) => b ? res(b) : rej(new Error('export failed')), mime, 0.92));
      downloadBlob(blob, `image-studio.${format}`);
    } catch (e) { setError((e as Error).message || 'Export failed.'); }
    finally { setBusy(''); }
  };

  const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'move', icon: <Move className="h-4 w-4" />, label: 'Move (V)' },
    { id: 'brush', icon: <Brush className="h-4 w-4" />, label: 'Brush (B)' },
    { id: 'eraser', icon: <Eraser className="h-4 w-4" />, label: 'Eraser (E)' },
    { id: 'smooth', icon: <Droplets className="h-4 w-4" />, label: 'Smooth skin' },
    { id: 'heal', icon: <Bandage className="h-4 w-4" />, label: 'Spot heal' },
    { id: 'clone', icon: <Stamp className="h-4 w-4" />, label: 'Clone stamp (Alt-click sets source)' },
    { id: 'eyedropper', icon: <Pipette className="h-4 w-4" />, label: 'Pick colour' },
    { id: 'gradient', icon: <PaintBucket className="h-4 w-4" />, label: 'Gradient' },
    { id: 'text', icon: <Type className="h-4 w-4" />, label: 'Text (T)' },
    { id: 'rect', icon: <Square className="h-4 w-4" />, label: 'Rectangle' },
    { id: 'ellipse', icon: <Circle className="h-4 w-4" />, label: 'Ellipse' },
    { id: 'crop', icon: <Crop className="h-4 w-4" />, label: 'Crop (C)' },
  ];
  const BLENDS: Blend[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'difference'];

  if (!w) {
    return (
      <div className="space-y-4">
        {gate}
        <div onClick={() => fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadImage(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-16 text-center">
          <ImageIcon className="h-8 w-8 text-[var(--color-cat-image)]" />
          <div className="text-[15px] font-semibold">Drop an image to start editing</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">Layers, blend modes, filters, one-click background removal, crop, text & brush — all on your device.</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadImage(f); }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gate}
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" title={t.label} onClick={() => { setTool(t.id); if (t.id !== 'crop') setCropRect(null); }}
            className={cn('grid h-9 w-9 place-items-center border transition', tool === t.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10 text-[var(--color-fg)]' : 'border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]')}>{t.icon}</button>
        ))}
        <span className="mx-1 h-6 w-px bg-black/[0.1]" />
        <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} title="Color" className="h-8 w-8" />
        {tool === 'gradient' && <input type="color" value={grad2} onChange={(e) => setGrad2(e.target.value)} title="Gradient end colour" className="h-8 w-8" />}
        <label className="flex items-center gap-1.5 px-2 text-[11px] text-[var(--color-fg-muted)]">Size
          <input type="range" min={2} max={160} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)} />
        </label>
        {tool === 'crop' && cropRect && <button type="button" onClick={applyCrop} className="border border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10 px-2.5 py-1.5 text-[11px] font-bold uppercase">Apply crop</button>}
        <span className="mx-1 h-6 w-px bg-black/[0.1]" />
        <button type="button" onClick={undo} disabled={!undoStack.current.length} title="Undo (Ctrl+Z)" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={redo} disabled={!redoStack.current.length} title="Redo" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        <span className="mx-1 h-6 w-px bg-black/[0.1]" />
        <button type="button" onClick={() => setZoom((z) => Math.max(0.1, z - 0.2))} title="Zoom out" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><ZoomOut className="h-4 w-4" /></button>
        <button type="button" onClick={() => setZoom(1)} title="Fit" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><Maximize className="h-4 w-4" /></button>
        <button type="button" onClick={() => setZoom((z) => Math.min(5, z + 0.2))} title="Zoom in" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><ZoomIn className="h-4 w-4" /></button>
        <button type="button" onClick={flatten} title="Flatten all layers" className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><Layers className="h-4 w-4" /></button>
        <button type="button" onClick={() => fileRef.current?.click()} title="Add image layer" className="ml-auto flex items-center gap-1.5 border border-black/[0.12] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--color-surface-2)]"><Plus className="h-3.5 w-3.5" /> Image</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadImage(f); e.target.value = ''; }} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_252px]">
        {/* canvas */}
        <div className="flex items-start justify-center overflow-auto border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-2" style={{ maxHeight: '64vh' }}>
          <canvas ref={displayRef} width={w} height={h}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onDoubleClick={() => { if (selLayer?.kind === 'text') { const t = window.prompt('Edit text:', selLayer.text); if (t != null) patch(selLayer.id, { text: t }); } }}
            style={{ width: w * zoom, height: h * zoom, touchAction: 'none', cursor: tool === 'move' ? 'move' : 'crosshair', imageRendering: zoom > 1.5 ? 'pixelated' : 'auto' }} />
        </div>

        {/* right panel */}
        <div className="space-y-3">
          {selLayer?.kind === 'image' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={removeBg} disabled={!!busy}
                className="flex items-center justify-center gap-1.5 border border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10 px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-cat-image)]/20 disabled:opacity-50">
                {busy === 'Removing background…' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Cut out
              </button>
              <button type="button" onClick={() => applyPreset({ contrast: 112, saturate: 120, brightness: 104 })}
                className="flex items-center justify-center gap-1.5 border border-black/[0.12] px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
                <Sparkles className="h-3.5 w-3.5" /> Auto
              </button>
            </div>
          )}

          {(tool === 'smooth' || tool === 'heal' || tool === 'clone') && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2 text-[11px] text-[var(--color-fg-muted)]">
              {tool === 'clone' ? 'Alt-click to set the clone source, then paint to copy.' : (
                <label className="flex items-center justify-between gap-2 text-[var(--color-fg)]">Strength<input type="range" min={10} max={100} value={retouch} onChange={(e) => setRetouch(+e.target.value)} /></label>
              )}
            </div>
          )}

          {/* presets */}
          {selLayer && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Filters</div>
              <div className="grid grid-cols-4 gap-1">
                {PRESETS.map((p) => <button key={p.name} type="button" onClick={() => applyPreset(p.a)} className="border border-black/[0.1] px-1 py-1 text-[10px] font-semibold hover:bg-[var(--color-surface-2)]">{p.name}</button>)}
              </div>
            </div>
          )}

          {selLayer?.kind === 'image' && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]"><SlidersHorizontal className="h-3 w-3" /> Effects (applied)</div>
              <div className="grid grid-cols-3 gap-1">
                {(['sharpen', 'emboss', 'pixelate', 'posterize', 'noise', 'threshold'] as const).map((f) => <button key={f} type="button" onClick={() => applyFilter(f)} className="border border-black/[0.1] px-1 py-1 text-[10px] font-semibold capitalize hover:bg-[var(--color-surface-2)]">{f}</button>)}
              </div>
            </div>
          )}

          {/* layers */}
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Layers</div>
            <div className="max-h-44 overflow-auto">
              {[...layers].reverse().map((l) => (
                <div key={l.id} onClick={() => setSel(l.id)}
                  className={cn('flex items-center gap-1.5 px-2 py-1.5 text-[12px] cursor-pointer border-l-2', sel === l.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/5' : 'border-transparent hover:bg-[var(--color-surface-2)]')}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); patch(l.id, { visible: !l.visible }); }} className="text-[var(--color-fg-muted)]">{l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                  {editingName === l.id
                    ? <input autoFocus defaultValue={l.name} onBlur={(e) => { patch(l.id, { name: e.target.value || l.name }); setEditingName(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="flex-1 bg-transparent text-[12px] outline-none" />
                    : <span className="flex-1 truncate" onDoubleClick={(e) => { e.stopPropagation(); setEditingName(l.id); }}>{l.name}</span>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); duplicate(l.id); }} title="Duplicate" className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"><Copy className="h-3 w-3" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"><ChevronUp className="h-3 w-3" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"><ChevronDown className="h-3 w-3" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); del(l.id); }} className="text-[var(--color-fg-subtle)] hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              {!layers.length && <div className="px-3 py-3 text-[11px] text-[var(--color-fg-subtle)]">No layers yet.</div>}
            </div>
          </div>

          {/* selected layer props */}
          {selLayer && (
            <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <select value={selLayer.blend} onChange={(e) => patch(selLayer.id, { blend: e.target.value as Blend })} className="flex-1 border border-black/[0.1] bg-transparent px-1.5 py-1 text-[11px] capitalize outline-none">
                  {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <label className="flex items-center justify-between gap-2">Opacity<input type="range" min={0} max={1} step={0.02} value={selLayer.opacity} onChange={(e) => patch(selLayer.id, { opacity: +e.target.value })} /></label>
              {selLayer.kind === 'image' && (
                <div className="space-y-1.5 border-t border-black/[0.06] pt-2">
                  <label className="flex items-center justify-between gap-2">Scale<input type="range" min={0.1} max={3} step={0.05} value={selLayer.scale ?? 1} onChange={(e) => patch(selLayer.id, { scale: +e.target.value } as Partial<Layer>)} /></label>
                  <label className="flex items-center justify-between gap-2">Rotate<input type="range" min={-180} max={180} value={selLayer.rotation ?? 0} onChange={(e) => patch(selLayer.id, { rotation: +e.target.value })} /></label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => patch(selLayer.id, { flipH: !selLayer.flipH } as Partial<Layer>)} className={cn('flex flex-1 items-center justify-center gap-1 border py-1.5 text-[11px]', selLayer.flipH ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.12]')}><FlipHorizontal2 className="h-3.5 w-3.5" /> Flip H</button>
                    <button type="button" onClick={() => patch(selLayer.id, { flipV: !selLayer.flipV } as Partial<Layer>)} className={cn('flex flex-1 items-center justify-center gap-1 border py-1.5 text-[11px]', selLayer.flipV ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.12]')}><FlipVertical2 className="h-3.5 w-3.5" /> Flip V</button>
                  </div>
                </div>
              )}
              {selLayer.kind === 'text' && (
                <div className="space-y-1.5 border-t border-black/[0.06] pt-2">
                  <input value={selLayer.text} onChange={(e) => patch(selLayer.id, { text: e.target.value })} className="w-full border border-black/[0.1] bg-transparent px-2 py-1 text-[12px] outline-none" />
                  <select value={selLayer.font || FONTS[0]} onChange={(e) => patch(selLayer.id, { font: e.target.value } as Partial<Layer>)} className="w-full border border-black/[0.1] bg-transparent px-1.5 py-1 text-[11px] outline-none">{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}</select>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">{(['left', 'center', 'right'] as const).map((al) => <button key={al} type="button" onClick={() => patch(selLayer.id, { align: al } as Partial<Layer>)} className={cn('border px-1.5 py-1 text-[10px] uppercase', (selLayer.align || 'left') === al ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.12]')}>{al[0]}</button>)}</div>
                    <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={!!selLayer.italic} onChange={(e) => patch(selLayer.id, { italic: e.target.checked } as Partial<Layer>)} /> Italic</label>
                    <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={!!selLayer.outline} onChange={(e) => patch(selLayer.id, { outline: e.target.checked } as Partial<Layer>)} /> Outline</label>
                    {selLayer.outline && <input type="color" value={selLayer.outlineColor || '#000000'} onChange={(e) => patch(selLayer.id, { outlineColor: e.target.value } as Partial<Layer>)} className="h-6 w-7" />}
                  </div>
                  <label className="flex items-center justify-between gap-2">Size<input type="range" min={8} max={Math.round(h)} value={selLayer.size} onChange={(e) => patch(selLayer.id, { size: +e.target.value })} /></label>
                  <div className="flex items-center justify-between"><span>Colour</span><input type="color" value={selLayer.color} onChange={(e) => patch(selLayer.id, { color: e.target.value })} className="h-7 w-9" /></div>
                  <label className="flex items-center justify-between gap-2">Rotate<input type="range" min={-180} max={180} value={selLayer.rotation ?? 0} onChange={(e) => patch(selLayer.id, { rotation: +e.target.value })} /></label>
                </div>
              )}
              {selLayer.kind === 'shape' && <div className="flex items-center justify-between"><span>Colour</span><input type="color" value={selLayer.color} onChange={(e) => patch(selLayer.id, { color: e.target.value })} className="h-7 w-9" /></div>}
              <div className="space-y-1.5 border-t border-black/[0.06] pt-2">
                {([['Brightness', 'brightness', 0, 200], ['Contrast', 'contrast', 0, 200], ['Saturation', 'saturate', 0, 300], ['Hue', 'hue', -180, 180], ['Blur', 'blur', 0, 24]] as const).map(([lbl, key, mn, mx]) => (
                  <label key={key} className="flex items-center justify-between gap-2">{lbl}<input type="range" min={mn} max={mx} value={selLayer.adjust[key]} onChange={(e) => patch(selLayer.id, { adjust: { ...selLayer.adjust, [key]: +e.target.value } } as Partial<Layer>)} /></label>
                ))}
              </div>
            </div>
          )}

          {/* global effects */}
          <div className="space-y-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Effects</div>
            <label className="flex items-center justify-between gap-2">Vignette<input type="range" min={0} max={100} value={effects.vignette} onChange={(e) => setEffects((s) => ({ ...s, vignette: +e.target.value }))} /></label>
            <label className="flex items-center justify-between gap-2">Grain<input type="range" min={0} max={100} value={effects.grain} onChange={(e) => setEffects((s) => ({ ...s, grain: +e.target.value }))} /></label>
          </div>

          {/* export */}
          <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="flex gap-1.5">
              {(['png', 'jpg', 'webp'] as const).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={cn('flex-1 border px-2 py-1 text-[11px] font-bold uppercase', format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.1] text-[var(--color-fg-muted)]')}>{f}</button>)}
            </div>
            <button type="button" onClick={exportImage} disabled={!!busy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
              {busy === 'Exporting…' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export
            </button>
          </div>
        </div>
      </div>
      {busy && <div className="text-[12px] text-[var(--color-fg-muted)]">{busy}</div>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
