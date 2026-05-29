'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, X } from 'lucide-react';

type Layout = '1x2' | '2x1' | '2x2' | '3x1' | '1x3' | '3x2' | '2x3' | '3x3';
type Fit = 'cover' | 'contain';

interface ImageItem {
  file: File;
  url: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

const LAYOUTS: { id: Layout; rows: number; cols: number; label: string }[] = [
  { id: '1x2', rows: 1, cols: 2, label: '2 wide' },
  { id: '2x1', rows: 2, cols: 1, label: '2 tall' },
  { id: '2x2', rows: 2, cols: 2, label: '2×2' },
  { id: '3x1', rows: 3, cols: 1, label: '3 tall' },
  { id: '1x3', rows: 1, cols: 3, label: '3 wide' },
  { id: '3x2', rows: 3, cols: 2, label: '6 (3×2)' },
  { id: '2x3', rows: 2, cols: 3, label: '6 (2×3)' },
  { id: '3x3', rows: 3, cols: 3, label: '3×3' },
];

async function loadImage(file: File): Promise<ImageItem> {
  const url = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  return { file, url, bitmap, width: bitmap.width, height: bitmap.height };
}

export default function ImageCollageTool() {
  const [items, setItems] = React.useState<ImageItem[]>([]);
  const [layoutId, setLayoutId] = React.useState<Layout>('2x2');
  const [width, setWidth] = React.useState(1600);
  const [gap, setGap] = React.useState(12);
  const [bg, setBg] = React.useState('#ffffff');
  const [fit, setFit] = React.useState<Fit>('cover');
  const [error, setError] = React.useState('');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Only free resources on UNMOUNT. With [items] this fired on every add, so
  // the URLs and bitmaps of items still on screen were freed under us.
  const itemsRef = React.useRef<typeof items>([]);
  React.useEffect(() => { itemsRef.current = items; }, [items]);
  React.useEffect(() => () => {
    itemsRef.current.forEach((i) => { URL.revokeObjectURL(i.url); i.bitmap.close(); });
  }, []);

  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  const cellCount = layout.rows * layout.cols;

  const add = async (files: FileList | File[]) => {
    setError('');
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { setError('Drop one or more images.'); return; }
    const loaded = await Promise.all(list.map(loadImage));
    setItems((prev) => [...prev, ...loaded].slice(0, 9));
  };

  const removeAt = (i: number) => {
    setItems((prev) => {
      URL.revokeObjectURL(prev[i].url);
      prev[i].bitmap.close();
      return prev.filter((_, idx) => idx !== i);
    });
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const totalW = width;
    // Maintain a square base; let cell aspect determine total height.
    const cellW = (totalW - gap * (layout.cols + 1)) / layout.cols;
    const cellH = cellW * 0.75; // 4:3 default cell aspect
    const totalH = cellH * layout.rows + gap * (layout.rows + 1);
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < cellCount; i++) {
      const row = Math.floor(i / layout.cols);
      const col = i % layout.cols;
      const x = gap + col * (cellW + gap);
      const y = gap + row * (cellH + gap);
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.04;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.globalAlpha = 1;
      const img = items[i];
      if (!img) continue;

      const ratio = img.width / img.height;
      const cellRatio = cellW / cellH;
      let drawW = cellW, drawH = cellH;
      let dx = x, dy = y;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (fit === 'cover') {
        // Crop source.
        if (ratio > cellRatio) {
          sw = img.height * cellRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / cellRatio;
          sy = (img.height - sh) / 2;
        }
      } else {
        if (ratio > cellRatio) { drawH = cellW / ratio; dy = y + (cellH - drawH) / 2; }
        else { drawW = cellH * ratio; dx = x + (cellW - drawW) / 2; }
      }
      ctx.drawImage(img.bitmap, sx, sy, sw, sh, dx, dy, drawW, drawH);
    }
  }, [items, layout, layoutId, width, gap, bg, fit, cellCount]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `collage-${layoutId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, 'image/png');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void add(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-3"
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 py-3 text-[12px] text-[var(--color-fg-muted)]">
            <Upload className="h-4 w-4" />
            Drop or click to add images (max 9)
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
            {items.map((it, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden border border-black/[0.08]">
                <img src={it.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeAt(i)}
                  className="absolute right-0.5 top-0.5 bg-black/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-hidden border border-black/[0.08] bg-black/5">
          <canvas ref={canvasRef} className="block h-auto w-full" />
        </div>

        {error && <div className="text-[12px] text-red-600">{error}</div>}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Layout ({cellCount} cells)</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" onClick={() => setLayoutId(l.id)}
                className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${layoutId === l.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Width</span>
              <span className="font-mono text-[12px] tabular-nums">{width}px</span>
            </div>
            <Slider.Root value={[width]} min={600} max={3600} step={100}
              onValueChange={([v]) => setWidth(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Gap</span>
              <span className="font-mono text-[12px] tabular-nums">{gap}px</span>
            </div>
            <Slider.Root value={[gap]} min={0} max={60} step={2}
              onValueChange={([v]) => setGap(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Image fit</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(['cover', 'contain'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFit(f)}
                  className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${fit === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Background
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
          </div>
        </div>

        <button type="button" onClick={download} disabled={!items.length}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" />
          Download collage
        </button>
      </aside>
    </div>
  );
}
