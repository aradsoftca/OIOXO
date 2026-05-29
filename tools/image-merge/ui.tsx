'use client';

import * as React from 'react';
import { Upload, Download, X, ArrowUp, ArrowDown } from 'lucide-react';

type Layout = 'horizontal' | 'vertical' | 'grid';
type Format = 'png' | 'jpeg';

interface Item { file: File; url: string; bitmap: ImageBitmap }

export default function ImageMergeTool() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [layout, setLayout] = React.useState<Layout>('horizontal');
  const [gap, setGap] = React.useState(0);
  const [bg, setBg] = React.useState('#ffffff');
  const [format, setFormat] = React.useState<Format>('png');
  const [gridCols, setGridCols] = React.useState(2);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Unmount-only. With [items] the cleanup fired on every add/remove and tore
  // down the URLs+bitmaps of items still on screen.
  const itemsRef = React.useRef<typeof items>([]);
  React.useEffect(() => { itemsRef.current = items; }, [items]);
  React.useEffect(() => () => {
    itemsRef.current.forEach((i) => { URL.revokeObjectURL(i.url); i.bitmap.close(); });
  }, []);

  const add = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const loaded = await Promise.all(list.map(async (file) => ({ file, url: URL.createObjectURL(file), bitmap: await createImageBitmap(file) })));
    setItems((prev) => [...prev, ...loaded]);
  };
  const removeAt = (i: number) => setItems((prev) => { URL.revokeObjectURL(prev[i].url); prev[i].bitmap.close(); return prev.filter((_, idx) => idx !== i); });
  const move = (i: number, dir: -1 | 1) => setItems((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const render = React.useCallback((canvas: HTMLCanvasElement) => {
    if (!items.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (layout === 'horizontal') {
      const h = Math.max(...items.map((i) => i.bitmap.height));
      const widths = items.map((i) => Math.round(i.bitmap.width * (h / i.bitmap.height)));
      canvas.width = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      canvas.height = h;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      let x = 0;
      items.forEach((it, i) => { ctx.drawImage(it.bitmap, x, 0, widths[i], h); x += widths[i] + gap; });
    } else if (layout === 'vertical') {
      const w = Math.max(...items.map((i) => i.bitmap.width));
      const heights = items.map((i) => Math.round(i.bitmap.height * (w / i.bitmap.width)));
      canvas.width = w;
      canvas.height = heights.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      items.forEach((it, i) => { ctx.drawImage(it.bitmap, 0, y, w, heights[i]); y += heights[i] + gap; });
    } else {
      const cols = Math.max(1, gridCols);
      const rows = Math.ceil(items.length / cols);
      const cellW = Math.max(...items.map((i) => i.bitmap.width));
      const cellH = Math.max(...items.map((i) => i.bitmap.height));
      canvas.width = cellW * cols + gap * (cols - 1);
      canvas.height = cellH * rows + gap * (rows - 1);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      items.forEach((it, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const ratio = Math.min(cellW / it.bitmap.width, cellH / it.bitmap.height);
        const dw = it.bitmap.width * ratio, dh = it.bitmap.height * ratio;
        const x = c * (cellW + gap) + (cellW - dw) / 2;
        const y = r * (cellH + gap) + (cellH - dh) / 2;
        ctx.drawImage(it.bitmap, x, y, dw, dh);
      });
    }
  }, [items, layout, gap, bg, gridCols]);

  React.useEffect(() => { if (canvasRef.current) render(canvasRef.current); }, [render]);

  const download = () => {
    const canvas = canvasRef.current; if (!canvas || !items.length) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `merged-${items.length}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      // Defer revoke — mobile Safari/Firefox can abort the download if the
      // blob URL is torn down before the stream is established.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void add(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-4"
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 text-[12px] text-[var(--color-fg-muted)]">
            <Upload className="h-4 w-4" /> Drop images or click to add
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
        </div>
        {items.length > 0 && (
          <div className="overflow-hidden border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:24px_24px]">
            <canvas ref={canvasRef} className="block h-auto max-h-[460px] w-full object-contain" />
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Layout</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(['horizontal', 'vertical', 'grid'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLayout(l)}
                className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${layout === l ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {l === 'horizontal' ? 'Row' : l === 'vertical' ? 'Column' : 'Grid'}
              </button>
            ))}
          </div>
          {layout === 'grid' && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Columns</span>
                <span className="font-mono text-[12px] tabular-nums">{gridCols}</span>
              </div>
              <input type="range" min={1} max={6} step={1} value={gridCols} onChange={(e) => setGridCols(parseInt(e.target.value, 10))} className="mt-2 w-full" />
            </div>
          )}
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Gap</span>
              <span className="font-mono text-[12px] tabular-nums">{gap}px</span>
            </div>
            <input type="range" min={0} max={80} step={2} value={gap} onChange={(e) => setGap(parseInt(e.target.value, 10))} className="mt-2 w-full" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
            Background
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
          </label>
        </div>

        {items.length > 0 && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] max-h-[180px] overflow-y-auto">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-black/[0.04] px-2 py-1.5 last:border-b-0">
                <img src={it.url} alt="" className="h-8 w-8 border border-black/[0.08] object-cover" />
                <span className="flex-1 truncate text-[11px] text-[var(--color-fg)]">{it.file.name}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                <button type="button" onClick={() => removeAt(i)} className="text-[var(--color-fg-muted)] hover:text-red-600"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['png', 'jpeg'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)}
                className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {f === 'jpeg' ? 'JPG' : 'PNG'}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={download} disabled={!items.length}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </aside>
    </div>
  );
}
