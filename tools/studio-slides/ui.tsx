'use client';

/**
 * Slides Studio — free-canvas deck builder (rebuilt on the shared element model).
 *
 * Was one title + one body textarea per slide (a note-taker, not a deck editor).
 * Now every slide is a free canvas of draggable/resizable/rotatable text, shape,
 * and image elements — the structural flip from toy to real. Reorder/duplicate/
 * delete slides, themes, present mode, and PDF/PNG export, all on-device.
 */

import * as React from 'react';
import { Plus, Copy, Trash2, Download, ChevronUp, ChevronDown, Presentation, Type, Square, Circle, Image as ImageIcon, Play } from 'lucide-react';
import { setRecent } from '@/lib/storage/recent';
import {
  ElementCanvas, type CanvasElement, type TextElement, makeText, makeShape, makeImage,
  renderElements,
} from '@/lib/studios';

interface Slide { id: string; theme: number; elements: CanvasElement[] }

const THEMES = [
  { name: 'Paper', bg: '#ffffff', color: '#111111', accent: '#2563eb' },
  { name: 'Midnight', bg: '#0f172a', color: '#f8fafc', accent: '#38bdf8' },
  { name: 'Ink', bg: '#111111', color: '#fafafa', accent: '#f59e0b' },
  { name: 'Forest', bg: '#064e3b', color: '#ecfdf5', accent: '#34d399' },
  { name: 'Berry', bg: '#4a044e', color: '#fdf4ff', accent: '#e879f9' },
];

const W = 1920, H = 1080;
const uid = () => Math.random().toString(36).slice(2, 9);

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function starterSlide(theme: number, title: string, body: string): Slide {
  const t = THEMES[theme] ?? THEMES[0];
  return {
    id: uid(), theme,
    elements: [
      makeShape({ x: 110, y: 250, w: 140, h: 14, shape: 'rect', fill: t.accent, stroke: 'transparent', strokeWidth: 0 }),
      makeText({ x: 110, y: 110, w: 1700, h: 200, text: title, fontSize: 96, weight: 800, color: t.color, align: 'left' }),
      makeText({ x: 110, y: 320, w: 1700, h: 600, text: body, fontSize: 48, weight: 400, color: t.color, align: 'left', lineHeight: 1.35 }),
    ],
  };
}

export default function SlidesStudioUI() {
  const [slides, setSlides] = React.useState<Slide[]>([
    starterSlide(1, 'My Presentation', 'A deck built entirely in your browser.\nClick any element to move, resize, or rotate it.'),
    starterSlide(0, 'Agenda', '• Point one\n• Point two\n• Point three'),
  ]);
  const [active, setActive] = React.useState(0);
  const [selId, setSelId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('presentation');
  const [present, setPresent] = React.useState(false);
  const cur = slides[active];
  const theme = THEMES[cur?.theme ?? 0] ?? THEMES[0];

  // Undo stack (simple snapshot).
  const undoStack = React.useRef<Slide[][]>([]);
  const pushUndo = () => { undoStack.current.push(slides.map(s => ({ ...s, elements: s.elements.map(e => ({ ...e })) }))); if (undoStack.current.length > 50) undoStack.current.shift(); };
  const undo = () => { const prev = undoStack.current.pop(); if (prev) { setSlides(prev); } };

  const setElements = (next: CanvasElement[], commit: boolean) => {
    if (commit) pushUndo();
    setSlides(s => s.map((sl, i) => i === active ? { ...sl, elements: next } : sl));
  };
  const addElement = (el: CanvasElement) => { pushUndo(); setSlides(s => s.map((sl, i) => i === active ? { ...sl, elements: [...sl.elements, el] } : sl)); setSelId(el.id); };
  const updateSelected = (patch: Partial<CanvasElement>) => {
    pushUndo();
    setSlides(s => s.map((sl, i) => i === active ? { ...sl, elements: sl.elements.map(e => e.id === selId ? { ...e, ...patch } as CanvasElement : e) } : sl));
  };
  const deleteSelected = () => { if (!selId) return; pushUndo(); setSlides(s => s.map((sl, i) => i === active ? { ...sl, elements: sl.elements.filter(e => e.id !== selId) } : sl)); setSelId(null); };

  const addSlide = () => { pushUndo(); const nx = starterSlide(cur?.theme ?? 0, 'New slide', ''); setSlides(s => { const n = [...s]; n.splice(active + 1, 0, nx); return n; }); setActive(active + 1); };
  const dupSlide = () => { pushUndo(); setSlides(s => { const n = [...s]; const copy = { ...s[active], id: uid(), elements: s[active].elements.map(e => ({ ...e, id: uid() })) }; n.splice(active + 1, 0, copy); return n; }); setActive(active + 1); };
  const delSlide = () => { if (slides.length <= 1) return; pushUndo(); setSlides(s => s.filter((_, i) => i !== active)); };
  const move = (dir: -1 | 1) => { const j = active + dir; if (j < 0 || j >= slides.length) return; pushUndo(); setSlides(s => { const n = [...s]; [n[active], n[j]] = [n[j], n[active]]; return n; }); setActive(j); };
  const setTheme = (ti: number) => { pushUndo(); setSlides(s => s.map((sl, i) => i === active ? { ...sl, theme: ti } : sl)); };

  React.useEffect(() => { if (active >= slides.length) setActive(slides.length - 1); }, [slides.length, active]);

  const addImage = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { addElement(makeImage(img, { x: 600, y: 300, w: Math.min(800, img.width), h: Math.min(800, img.width) * (img.height / img.width) })); URL.revokeObjectURL(url); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const paintSlide = (ctx: CanvasRenderingContext2D, s: Slide) => {
    const t = THEMES[s.theme] ?? THEMES[0];
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
    renderElements(ctx, s.elements);
  };

  const exportPng = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); if (!ctx) return;
    paintSlide(ctx, cur);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${name}-${active + 1}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setRecent('studio-slides', `${name}-${active + 1}.png`);
  };

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H] });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    slides.forEach((s, i) => {
      if (i > 0) pdf.addPage([W, H], 'landscape');
      paintSlide(ctx, s);
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
    });
    try { const { brandJsPdf } = await import('@/lib/watermark/download'); brandJsPdf(pdf); } catch { /* */ }
    pdf.save(`${name}.pdf`);
    setRecent('studio-slides', `${name}.pdf`);
  };

  const selected = cur?.elements.find(e => e.id === selId) ?? null;
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Present mode: full-screen slideshow with arrow-key nav.
  React.useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setActive(a => Math.min(slides.length - 1, a + 1));
      else if (e.key === 'ArrowLeft') setActive(a => Math.max(0, a - 1));
      else if (e.key === 'Escape') setPresent(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [present, slides.length]);

  const btn = 'flex items-center gap-2 border border-black/[0.08] px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]';
  const icoBtn = 'flex h-9 w-9 items-center justify-center border border-black/[0.08] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]';

  if (present) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={() => setActive(a => Math.min(slides.length - 1, a + 1))}>
        <PresentSlide slide={cur} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-white/10 px-3 py-1 text-xs text-white/70">{active + 1} / {slides.length} — ← → to navigate, Esc to exit</div>
        <button onClick={(e) => { e.stopPropagation(); setPresent(false); }} className="absolute right-4 top-4 rounded bg-white/10 px-3 py-1 text-xs text-white">Exit</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={addSlide}><Plus className="h-3.5 w-3.5" /> Slide</button>
        <button type="button" className={btn} onClick={dupSlide}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
        <button type="button" className={btn} onClick={delSlide}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={btn} onClick={() => setPresent(true)}><Play className="h-3.5 w-3.5" /> Present</button>
        <button type="button" className={btn} onClick={exportPdf}><Download className="h-3.5 w-3.5" /> PDF deck</button>
        <button type="button" className={btn} onClick={exportPng}><Download className="h-3.5 w-3.5" /> PNG slide</button>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="ml-auto w-44 bg-transparent text-[13px] text-[var(--color-fg)] outline-none border-b border-black/[0.08] py-0.5" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[170px_minmax(0,1fr)_220px]">
        {/* slide list */}
        <div className="space-y-2 overflow-auto" style={{ maxHeight: '64vh' }}>
          {slides.map((s, i) => {
            const th = THEMES[s.theme] ?? THEMES[0];
            const title = (s.elements.find(e => e.kind === 'text') as TextElement | undefined)?.text ?? 'Untitled';
            return (
              <button key={s.id} type="button" onClick={() => { setActive(i); setSelId(null); }}
                className={`block w-full overflow-hidden border text-left transition ${i === active ? 'border-[var(--color-cat-convert)] ring-1 ring-[var(--color-cat-convert)]' : 'border-black/[0.08]'}`}>
                <div className="flex aspect-video flex-col justify-center px-2" style={{ background: th.bg, color: th.color }}>
                  <div className="truncate text-[10px] font-bold">{title || 'Untitled'}</div>
                </div>
                <div className="bg-[var(--color-surface-1)] px-2 py-0.5 text-[10px] text-[var(--color-fg-muted)]">{i + 1}</div>
              </button>
            );
          })}
        </div>

        {/* editor */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={icoBtn} title="Add text" onClick={() => addElement(makeText({ text: 'Text', color: theme.color, x: 300, y: 400, fontSize: 64 }))}><Type className="h-4 w-4" /></button>
            <button type="button" className={icoBtn} title="Add rectangle" onClick={() => addElement(makeShape({ shape: 'roundedRect', fill: theme.accent }))}><Square className="h-4 w-4" /></button>
            <button type="button" className={icoBtn} title="Add ellipse" onClick={() => addElement(makeShape({ shape: 'ellipse', fill: theme.accent }))}><Circle className="h-4 w-4" /></button>
            <button type="button" className={icoBtn} title="Add image" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4" /></button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.currentTarget.value = ''; }} />
            <span className="mx-1 h-5 w-px bg-black/[0.12]" />
            <button type="button" className={icoBtn} title="Move slide up" onClick={() => move(-1)}><ChevronUp className="h-4 w-4" /></button>
            <button type="button" className={icoBtn} title="Move slide down" onClick={() => move(1)}><ChevronDown className="h-4 w-4" /></button>
          </div>

          <div className="mx-auto w-full max-w-[760px] border border-black/[0.08] shadow-lg">
            {cur && (
              <ElementCanvas
                width={W} height={H} background={theme.bg}
                elements={cur.elements} selectedId={selId}
                onSelect={setSelId} onChange={setElements}
                maxWidth={760}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]"><Presentation className="h-3.5 w-3.5" /> Theme</span>
            {THEMES.map((th, i) => (
              <button key={th.name} type="button" onClick={() => setTheme(i)} title={th.name}
                className={`h-7 w-7 rounded-full border-2 ${cur?.theme === i ? 'border-[var(--color-cat-convert)]' : 'border-black/15'}`}
                style={{ background: th.bg }}>
                <span className="block h-full w-full rounded-full" style={{ boxShadow: `inset 0 0 0 3px ${th.accent}` }} />
              </button>
            ))}
          </div>
        </div>

        {/* inspector */}
        <div className="space-y-2 text-[12px]">
          {selected ? (
            <ElementInspector el={selected} onChange={updateSelected} onDelete={deleteSelected} />
          ) : (
            <div className="rounded border border-dashed border-black/[0.12] p-3 text-[var(--color-fg-muted)]">Select an element to edit it, or use the tools above to add text, shapes, and images. Drag the handles to resize; the top dot rotates.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PresentSlide({ slide }: { slide: Slide }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const t = THEMES[slide.theme] ?? THEMES[0];
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
    renderElements(ctx, slide.elements);
  }, [slide]);
  return <canvas ref={ref} className="max-h-[100vh] max-w-[100vw]" style={{ aspectRatio: '16/9', width: '100vw', objectFit: 'contain' }} />;
}

function ElementInspector({ el, onChange, onDelete }: { el: CanvasElement; onChange: (p: Partial<CanvasElement>) => void; onDelete: () => void }) {
  const row = 'flex items-center justify-between gap-2';
  return (
    <div className="space-y-2 rounded border border-black/[0.08] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{el.kind}</span>
        <button onClick={onDelete} className="text-[var(--color-fg-subtle)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {el.kind === 'text' && (
        <>
          <textarea value={(el as TextElement).text} onChange={(e) => onChange({ text: e.target.value } as Partial<CanvasElement>)} rows={3}
            className="w-full resize-none border border-black/[0.1] bg-[var(--color-surface-1)] px-2 py-1 text-[13px] outline-none" />
          <label className={row}>Size<input type="range" min={16} max={240} value={(el as TextElement).fontSize} onChange={(e) => onChange({ fontSize: +e.target.value } as Partial<CanvasElement>)} /></label>
          <label className={row}>Weight
            <select value={(el as TextElement).weight} onChange={(e) => onChange({ weight: +e.target.value } as Partial<CanvasElement>)} className="border border-black/[0.1] bg-transparent px-1 py-0.5">
              {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className={row}>Align
            <select value={(el as TextElement).align} onChange={(e) => onChange({ align: e.target.value as CanvasTextAlign } as Partial<CanvasElement>)} className="border border-black/[0.1] bg-transparent px-1 py-0.5">
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>
          <label className={row}>Color<input type="color" value={(el as TextElement).color} onChange={(e) => onChange({ color: e.target.value } as Partial<CanvasElement>)} /></label>
        </>
      )}
      {el.kind === 'shape' && (
        <label className={row}>Fill<input type="color" value={(el as any).fill === 'transparent' ? '#000000' : (el as any).fill} onChange={(e) => onChange({ fill: e.target.value } as Partial<CanvasElement>)} /></label>
      )}
      <label className={row}>Opacity<input type="range" min={0} max={100} value={Math.round(el.opacity * 100)} onChange={(e) => onChange({ opacity: +e.target.value / 100 })} /></label>
      <label className={row}>Rotation<input type="range" min={-180} max={180} value={el.rotation} onChange={(e) => onChange({ rotation: +e.target.value })} /></label>
    </div>
  );
}
