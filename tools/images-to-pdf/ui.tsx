'use client';

import * as React from 'react';
import { Download, Loader2, Upload, X, ArrowUp, ArrowDown } from 'lucide-react';

type Orientation = 'auto' | 'portrait' | 'landscape';
type PaperSize = 'fit' | 'a4' | 'letter' | 'legal' | 'a3';
type FitMode = 'contain' | 'cover' | 'stretch';

interface ImageItem {
  file: File;
  url: string;
  width: number;
  height: number;
}

const PAPER: Record<Exclude<PaperSize, 'fit'>, { w: number; h: number; label: string }> = {
  a4:     { w: 595, h: 842, label: 'A4' },
  letter: { w: 612, h: 792, label: 'Letter' },
  legal:  { w: 612, h: 1008, label: 'Legal' },
  a3:     { w: 842, h: 1191, label: 'A3' },
};

async function fileToImage(file: File): Promise<ImageItem> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read image'));
  });
  return { file, url, width: img.naturalWidth, height: img.naturalHeight };
}

export default function ImagesToPdfTool() {
  const [items, setItems] = React.useState<ImageItem[]>([]);
  const [paper, setPaper] = React.useState<PaperSize>('fit');
  const [orientation, setOrientation] = React.useState<Orientation>('auto');
  const [fit, setFit] = React.useState<FitMode>('contain');
  const [margin, setMargin] = React.useState(20);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { items.forEach((i) => URL.revokeObjectURL(i.url)); }, [items]);

  const add = async (files: FileList | File[]) => {
    setError('');
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { setError('Drop one or more images.'); return; }
    try {
      const loaded = await Promise.all(list.map(fileToImage));
      setItems((prev) => [...prev, ...loaded]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeAt = (i: number) => {
    setItems((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  };
  const moveUp = (i: number) => {
    if (i === 0) return;
    setItems((prev) => { const next = [...prev]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; });
  };
  const moveDown = (i: number) => {
    setItems((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; return next;
    });
  };

  const build = async () => {
    if (!items.length) return;
    setBusy(true); setError('');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();

      for (const it of items) {
        const bytes = await it.file.arrayBuffer();
        const isPng = it.file.type === 'image/png' || it.file.name.toLowerCase().endsWith('.png');
        const isJpg = it.file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(it.file.name);

        let embed;
        if (isJpg) {
          embed = await doc.embedJpg(bytes);
        } else if (isPng) {
          embed = await doc.embedPng(bytes);
        } else {
          // Convert to PNG via canvas for webp/avif/other formats.
          const canvas = document.createElement('canvas');
          canvas.width = it.width;
          canvas.height = it.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not available');
          const bm = await createImageBitmap(it.file);
          ctx.drawImage(bm, 0, 0);
          bm.close();
          const pngBlob: Blob = await new Promise((resolve, reject) =>
            canvas.toBlob((b) => b ? resolve(b) : reject(new Error('encode failed')), 'image/png'));
          embed = await doc.embedPng(await pngBlob.arrayBuffer());
        }

        let pageW: number, pageH: number;
        if (paper === 'fit') {
          // Page fits image exactly (1px → 1pt).
          pageW = it.width;
          pageH = it.height;
        } else {
          const base = PAPER[paper];
          const landscape =
            orientation === 'landscape' ||
            (orientation === 'auto' && it.width > it.height);
          pageW = landscape ? base.h : base.w;
          pageH = landscape ? base.w : base.h;
        }

        const page = doc.addPage([pageW, pageH]);
        const innerW = Math.max(1, pageW - margin * 2);
        const innerH = Math.max(1, pageH - margin * 2);

        let drawW = innerW, drawH = innerH;
        if (paper === 'fit' || fit === 'stretch') {
          drawW = innerW; drawH = innerH;
        } else {
          const ratio = it.width / it.height;
          const innerRatio = innerW / innerH;
          if (fit === 'contain' ? ratio > innerRatio : ratio < innerRatio) {
            drawW = innerW;
            drawH = innerW / ratio;
          } else {
            drawH = innerH;
            drawW = innerH * ratio;
          }
        }
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;
        page.drawImage(embed, { x, y, width: drawW, height: drawH });
      }

      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = items.length === 1
        ? items[0].file.name.replace(/\.[^.]+$/, '') + '.pdf'
        : `images-${items.length}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-6"
      >
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
          <Upload className="h-4 w-4" />
          Drop images here or click to browse (JPG, PNG, WebP)
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{items.length} {items.length === 1 ? 'image' : 'images'}</div>
              <button type="button" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]); }}
                className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Clear all
              </button>
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-black/[0.04] px-3 py-2 last:border-b-0">
                  <div className="h-12 w-12 shrink-0 overflow-hidden border border-black/[0.08] bg-black/[0.02]">
                    <img src={it.url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-[var(--color-fg)]">{it.file.name}</div>
                    <div className="font-mono text-[10px] text-[var(--color-fg-muted)]">{it.width}×{it.height}</div>
                  </div>
                  <button type="button" onClick={() => moveUp(i)} disabled={i === 0}
                    className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-40">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => moveDown(i)} disabled={i === items.length - 1}
                    className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-40">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => removeAt(i)}
                    className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Page size</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['fit', 'a4', 'letter', 'legal', 'a3'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setPaper(s)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${paper === s ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {s === 'fit' ? 'Fit image' : PAPER[s].label}
                  </button>
                ))}
              </div>
            </div>

            {paper !== 'fit' && (
              <>
                <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Orientation</div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(['auto', 'portrait', 'landscape'] as const).map((o) => (
                      <button key={o} type="button" onClick={() => setOrientation(o)}
                        className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${orientation === o ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Image fit</div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(['contain', 'cover', 'stretch'] as const).map((f) => (
                      <button key={f} type="button" onClick={() => setFit(f)}
                        className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${fit === f ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Margin</span>
                    <span className="font-mono text-[12px] tabular-nums">{margin} pt</span>
                  </div>
                  <input type="range" min={0} max={72} step={2} value={margin}
                    onChange={(e) => setMargin(parseInt(e.target.value, 10))}
                    className="mt-2 w-full" />
                </div>
              </>
            )}

            <button type="button" onClick={build} disabled={busy || !items.length}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Build PDF
            </button>

            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
