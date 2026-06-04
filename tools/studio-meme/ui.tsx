'use client';

/**
 * Meme Studio — rebuilt on the shared element model.
 *
 * Was upload-only with two hardcoded top/bottom captions. Now: a template
 * gallery (classic meme layouts incl. the top-caption "what-if" bar and the
 * two-panel split), upload your own image, and any number of draggable /
 * resizable / rotatable Impact-style caption boxes via ElementCanvas. The
 * defining meme feature (templates) + free placement, all on-device.
 */

import * as React from 'react';
import { Upload, Download, Type, Plus, Trash2, ImagePlus } from 'lucide-react';
import {
  ElementCanvas, type CanvasElement, type TextElement, makeText, makeImage, makeShape,
  renderElements,
} from '@/lib/studios';

const W = 1080, H = 1080;

// Classic meme caption box — white Impact, black outline, centered, uppercase look.
function captionBox(text: string, y: number): TextElement {
  return makeText({
    text, x: 60, y, w: W - 120, h: 160,
    font: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    fontSize: 88, weight: 900, color: '#ffffff', align: 'center', lineHeight: 1.05,
    outline: true, outlineColor: '#000000', outlineWidth: 8,
  });
}

interface Template { id: string; name: string; build: () => { bg: string; elements: CanvasElement[] } }

const TEMPLATES: Template[] = [
  {
    id: 'top-bottom', name: 'Top / Bottom',
    build: () => ({ bg: '#222222', elements: [captionBox('TOP TEXT', 40), captionBox('BOTTOM TEXT', H - 200)] }),
  },
  {
    id: 'top-bar', name: 'Caption bar',
    build: () => ({
      bg: '#000000',
      elements: [
        makeShape({ x: 0, y: 0, w: W, h: 180, shape: 'rect', fill: '#ffffff', stroke: 'transparent', strokeWidth: 0 }),
        makeText({ text: 'When the caption goes on top', x: 40, y: 40, w: W - 80, h: 120, font: 'Arial, sans-serif', fontSize: 60, weight: 700, color: '#000000', align: 'center', outline: false }),
      ],
    }),
  },
  {
    id: 'two-panel', name: 'Two panel',
    build: () => ({
      bg: '#dddddd',
      elements: [
        makeShape({ x: 0, y: H / 2 - 3, w: W, h: 6, shape: 'rect', fill: '#000000', stroke: 'transparent', strokeWidth: 0 }),
        captionBox('TOP PANEL', 30),
        captionBox('BOTTOM PANEL', H / 2 + 30),
      ],
    }),
  },
  {
    id: 'blank', name: 'Blank canvas',
    build: () => ({ bg: '#ffffff', elements: [captionBox('YOUR TEXT', H - 200)] }),
  },
];

export default function MemeStudioUI() {
  const [bg, setBg] = React.useState('#222222');
  const [elements, setElements] = React.useState<CanvasElement[]>(() => TEMPLATES[0].build().elements);
  const [selId, setSelId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const undoStack = React.useRef<CanvasElement[][]>([]);
  const pushUndo = () => { undoStack.current.push(elements.map(e => ({ ...e }))); if (undoStack.current.length > 40) undoStack.current.shift(); };

  const onChange = (next: CanvasElement[], commit: boolean) => { if (commit) pushUndo(); setElements(next); };
  const applyTemplate = (t: Template) => { pushUndo(); const r = t.build(); setBg(r.bg); setElements(r.elements); setSelId(null); };

  const addImage = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      pushUndo();
      // Cover the whole canvas as a background image element placed at the bottom.
      const cover = makeImage(img, { x: 0, y: 0, w: W, h: H, fit: 'cover' });
      setElements(els => [cover, ...els]);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };
  const addImageOverlay = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { pushUndo(); const e = makeImage(img, { x: 300, y: 300, w: Math.min(500, img.width), h: Math.min(500, img.width) * (img.height / img.width), fit: 'contain' }); setElements(els => [...els, e]); setSelId(e.id); URL.revokeObjectURL(url); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const addCaption = () => { pushUndo(); const c = captionBox('NEW CAPTION', 460); setElements(els => [...els, c]); setSelId(c.id); };
  const updateSel = (patch: Partial<CanvasElement>) => { pushUndo(); setElements(els => els.map(e => e.id === selId ? { ...e, ...patch } as CanvasElement : e)); };
  const delSel = () => { if (!selId) return; pushUndo(); setElements(els => els.filter(e => e.id !== selId)); setSelId(null); };

  const download = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    renderElements(ctx, elements);
    const a = document.createElement('a'); a.download = 'meme.png'; a.href = c.toDataURL('image/png');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const selected = elements.find(e => e.id === selId) ?? null;
  const btn = 'flex items-center justify-center gap-2 border border-black/[0.1] px-3 py-2 text-[12px] font-bold uppercase tracking-wider transition hover:bg-[var(--color-surface-2)]';

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr_220px]">
      {/* left: templates + add */}
      <div className="space-y-3">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Templates</div>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t)} className="border border-black/[0.1] p-2 text-[11px] font-semibold hover:bg-[var(--color-surface-2)]">{t.name}</button>
            ))}
          </div>
        </div>
        <button className={`w-full ${btn}`} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Background image</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addImage(f); e.currentTarget.value = ''; }} />
        <button className={`w-full ${btn}`} onClick={addCaption}><Type className="h-3.5 w-3.5" /> Add caption</button>
        <label className={`w-full cursor-pointer ${btn}`}><ImagePlus className="h-3.5 w-3.5" /> Add sticker
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addImageOverlay(f); e.currentTarget.value = ''; }} />
        </label>
        <label className="flex items-center justify-between gap-2 text-[12px]">Background<input type="color" value={bg} onChange={e => { pushUndo(); setBg(e.target.value); }} className="h-8 w-9 cursor-pointer border border-black/[0.1]" /></label>
        <button className="w-full bg-amber-500 px-4 py-2 font-bold text-white" onClick={download}><Download className="mr-1 inline h-4 w-4" /> Export meme</button>
      </div>

      {/* center: canvas */}
      <div className="flex items-start justify-center">
        <div className="border border-black/[0.1] shadow-lg">
          <ElementCanvas width={W} height={H} background={bg} elements={elements} selectedId={selId} onSelect={setSelId} onChange={onChange} maxWidth={560} />
        </div>
      </div>

      {/* right: inspector */}
      <div className="text-[12px]">
        {selected ? (
          <div className="space-y-2 rounded border border-black/[0.1] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{selected.kind}</span>
              <button onClick={delSel} className="text-[var(--color-fg-subtle)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {selected.kind === 'text' && (
              <>
                <textarea value={(selected as TextElement).text} onChange={e => updateSel({ text: e.target.value } as Partial<CanvasElement>)} rows={3} className="w-full resize-none border border-black/[0.1] bg-[var(--color-surface-1)] px-2 py-1 text-[13px] outline-none" />
                <label className="flex items-center justify-between gap-2">Size<input type="range" min={28} max={200} value={(selected as TextElement).fontSize} onChange={e => updateSel({ fontSize: +e.target.value } as Partial<CanvasElement>)} /></label>
                <label className="flex items-center justify-between gap-2">Color<input type="color" value={(selected as TextElement).color} onChange={e => updateSel({ color: e.target.value } as Partial<CanvasElement>)} /></label>
                <label className="flex items-center justify-between gap-2">Outline<input type="range" min={0} max={20} value={(selected as TextElement).outlineWidth} onChange={e => updateSel({ outline: +e.target.value > 0, outlineWidth: +e.target.value } as Partial<CanvasElement>)} /></label>
              </>
            )}
            <label className="flex items-center justify-between gap-2">Rotation<input type="range" min={-45} max={45} value={selected.rotation} onChange={e => updateSel({ rotation: +e.target.value })} /></label>
          </div>
        ) : (
          <div className="rounded border border-dashed border-black/[0.12] p-3 text-[var(--color-fg-muted)]">Pick a template, drop a background, then drag captions anywhere. Select an element to edit, resize via handles, rotate with the top dot.</div>
        )}
      </div>
    </div>
  );
}
