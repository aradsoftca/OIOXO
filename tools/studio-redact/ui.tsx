'use client';

/**
 * Redact & Annotate — oioxo / newxonvert version.
 * Load an image, then black-out or pixelate-blur regions and add arrows/text.
 * All compositing happens on a <canvas>; nothing is uploaded.
 */

import * as React from 'react';
import { Upload, Download, Square, Eraser, ArrowUpRight, Type, Undo2, Trash2 } from 'lucide-react';

type Tool = 'box' | 'blur' | 'arrow' | 'text';
interface Ann { type: Tool; x: number; y: number; w: number; h: number; color: string; text?: string; }

const COLORS = ['#000000', '#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff'];

export default function RedactStudioUI() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = React.useState<Ann | null>(null);

  const [hasImg, setHasImg] = React.useState(false);
  const [anns, setAnns] = React.useState<Ann[]>([]);
  const [tool, setTool] = React.useState<Tool>('box');
  const [color, setColor] = React.useState('#000000');
  const [textVal, setTextVal] = React.useState('Label');

  const paint = React.useCallback((extra?: Ann | null) => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const all = extra ? [...anns, extra] : anns;
    for (const a of all) {
      if (a.type === 'box') { ctx.fillStyle = a.color; ctx.fillRect(a.x, a.y, a.w, a.h); }
      else if (a.type === 'blur') {
        const sw = Math.max(1, Math.abs(a.w)), sh = Math.max(1, Math.abs(a.h));
        const sx = Math.min(a.x, a.x + a.w), sy = Math.min(a.y, a.y + a.h);
        const t = document.createElement('canvas'); const f = Math.max(1, Math.round(Math.max(sw, sh) / 14));
        t.width = Math.max(1, Math.round(sw / f)); t.height = Math.max(1, Math.round(sh / f));
        const tc = t.getContext('2d'); if (!tc) continue;
        tc.drawImage(img, sx, sy, sw, sh, 0, 0, t.width, t.height);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, sx, sy, sw, sh); ctx.imageSmoothingEnabled = true;
      } else if (a.type === 'arrow') {
        ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = Math.max(3, img.naturalWidth * 0.004); ctx.lineCap = 'round';
        const ex = a.x + a.w, ey = a.y + a.h; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
        const ang = Math.atan2(a.h, a.w), hl = ctx.lineWidth * 4;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - hl * Math.cos(ang - 0.4), ey - hl * Math.sin(ang - 0.4)); ctx.lineTo(ex - hl * Math.cos(ang + 0.4), ey - hl * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
      } else if (a.type === 'text' && a.text) {
        const fs = Math.max(16, img.naturalWidth * 0.03); ctx.font = `bold ${fs}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = a.color; ctx.strokeStyle = a.color === '#ffffff' ? '#000' : '#fff'; ctx.lineWidth = fs * 0.12; ctx.textBaseline = 'top';
        ctx.strokeText(a.text, a.x, a.y); ctx.fillText(a.text, a.x, a.y);
      }
    }
  }, [anns]);

  React.useEffect(() => { paint(); }, [paint]);

  const toImg = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * c.width, y: (e.clientY - r.top) / r.height * c.height };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!hasImg) return;
    const p = toImg(e);
    if (tool === 'text') { setAnns((a) => [...a, { type: 'text', x: p.x, y: p.y, w: 0, h: 0, color, text: textVal }]); return; }
    dragRef.current = p; (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const p = toImg(e); const a: Ann = { type: tool, x: d.x, y: d.y, w: p.x - d.x, h: p.y - d.y, color };
    setPreview(a); paint(a);
  };
  const onUp = () => {
    const d = dragRef.current, pv = preview; dragRef.current = null; setPreview(null);
    if (d && pv && (Math.abs(pv.w) > 3 || Math.abs(pv.h) > 3)) setAnns((a) => [...a, pv]);
  };

  const load = (file: File) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { imgRef.current = img; const c = canvasRef.current; if (c) { c.width = img.naturalWidth; c.height = img.naturalHeight; } setHasImg(true); setAnns([]); URL.revokeObjectURL(url); paint(); };
    // Without an error path, a corrupt image leaked the blob URL.
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };
  const download = () => { const c = canvasRef.current; if (!c || !hasImg) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'redacted.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); };

  const TOOLS: Array<{ id: Tool; icon: React.ReactNode; label: string }> = [
    { id: 'box', icon: <Square className="h-4 w-4" />, label: 'Black-out' },
    { id: 'blur', icon: <Eraser className="h-4 w-4" />, label: 'Blur' },
    { id: 'arrow', icon: <ArrowUpRight className="h-4 w-4" />, label: 'Arrow' },
    { id: 'text', icon: <Type className="h-4 w-4" />, label: 'Text' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="flex items-center justify-center border border-black/[0.08] bg-[var(--color-surface-2)] p-4" style={{ minHeight: 360 }}>
        {hasImg ? (
          <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
            className="max-h-[62vh] w-auto max-w-full cursor-crosshair touch-none" />
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-3 px-8 py-16 text-[var(--color-fg-muted)]"><Upload className="h-8 w-8" /><span className="text-[14px]">Drop an image or click to upload</span></button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
      </div>

      <aside className="space-y-4">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Upload className="h-3.5 w-3.5" /> {hasImg ? 'Replace' : 'Upload'}</button>
        <div className="grid grid-cols-2 gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTool(t.id)} className={`flex items-center justify-center gap-2 border py-2.5 text-[11px] font-bold uppercase transition ${tool === t.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>{t.icon}{t.label}</button>
          ))}
        </div>
        {tool === 'text' && (
          <input value={textVal} onChange={(e) => setTextVal(e.target.value)} placeholder="Text to place" className="w-full border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 text-[13px] text-[var(--color-fg)] outline-none" />
        )}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Colour</div>
          <div className="mt-2 flex gap-1.5">
            {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-[var(--color-fg)]' : 'border-black/15'}`} style={{ background: c }} />)}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAnns((a) => a.slice(0, -1))} disabled={!anns.length} className="flex flex-1 items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-bold uppercase text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
          <button type="button" onClick={() => setAnns([])} disabled={!anns.length} className="flex flex-1 items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-bold uppercase text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
        </div>
        <button type="button" onClick={download} disabled={!hasImg} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[13px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"><Download className="h-4 w-4" /> Download PNG</button>
        <p className="text-[11px] text-[var(--color-fg-subtle)]">Black-out fully hides pixels (safe for sharing); blur pixelates them. Drag on the image to draw.</p>
      </aside>
    </div>
  );
}
