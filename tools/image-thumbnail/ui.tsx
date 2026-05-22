'use client';

import * as React from 'react';
import { Upload, Download, Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Format = 'png' | 'jpeg' | 'webp';
type Fit = 'cover' | 'contain';

interface Size { value: number; label: string; group: string; default?: boolean }

const SIZES: Size[] = [
  { group: 'Favicon',  value: 16,   label: '16',  default: true },
  { group: 'Favicon',  value: 32,   label: '32',  default: true },
  { group: 'Favicon',  value: 48,   label: '48' },
  { group: 'App icon', value: 64,   label: '64' },
  { group: 'App icon', value: 128,  label: '128', default: true },
  { group: 'App icon', value: 192,  label: '192' },
  { group: 'App icon', value: 256,  label: '256' },
  { group: 'App icon', value: 512,  label: '512', default: true },
  { group: 'App icon', value: 1024, label: '1024' },
  { group: 'Web',      value: 200,  label: '200' },
  { group: 'Web',      value: 400,  label: '400', default: true },
  { group: 'Web',      value: 800,  label: '800' },
  { group: 'Web',      value: 1200, label: '1200' },
  { group: 'Web',      value: 1600, label: '1600' },
];

const GROUPS = ['Favicon', 'App icon', 'Web'] as const;

async function drawSize(bitmap: ImageBitmap, size: number, fit: Fit, format: Format, quality: number, bg: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  if (format === 'jpeg' || fit === 'contain') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const ratio = bitmap.width / bitmap.height;
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  let dx = 0, dy = 0, dw = size, dh = size;
  if (fit === 'cover') {
    if (ratio > 1) { sw = bitmap.height; sx = (bitmap.width - sw) / 2; }
    else { sh = bitmap.width; sy = (bitmap.height - sh) / 2; }
  } else {
    if (ratio > 1) { dh = size / ratio; dy = (size - dh) / 2; }
    else { dw = size * ratio; dx = (size - dw) / 2; }
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('encode failed')), mime, quality);
  });
}

export default function ImageThumbnailTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [selected, setSelected] = React.useState<Set<number>>(new Set(SIZES.filter((s) => s.default).map((s) => s.value)));
  const [format, setFormat] = React.useState<Format>('png');
  const [fit, setFit] = React.useState<Fit>('cover');
  const [bg, setBg] = React.useState('#ffffff');
  const [quality, setQuality] = React.useState(0.9);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); bitmap?.close(); }, [previewUrl, bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(next));
    if (bitmap) bitmap.close();
    try {
      const bm = await createImageBitmap(next);
      setBitmap(bm);
      setFile(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleSize = (v: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };
  const selectAll = (group: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      SIZES.filter((s) => s.group === group).forEach((s) => next.add(s.value));
      return next;
    });
  };
  const clearAll = () => setSelected(new Set());

  const downloadOne = async (size: number) => {
    if (!bitmap || !file) return;
    setBusy(true);
    try {
      const blob = await drawSize(bitmap, size, fit, format, quality, bg);
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-${size}.${format === 'jpeg' ? 'jpg' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    if (!bitmap || !file || !selected.size) return;
    setBusy(true); setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const base = file.name.replace(/\.[^.]+$/, '');
      for (const size of [...selected].sort((a, b) => a - b)) {
        const blob = await drawSize(bitmap, size, fit, format, quality, bg);
        const buf = await blob.arrayBuffer();
        zip.file(`${base}-${size}.${format === 'jpeg' ? 'jpg' : format}`, buf);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${base}-thumbnails.zip`;
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
      {!file && (
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" />
            Drop a photo or click to browse
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        </div>
      )}

      {file && bitmap && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <span className="text-[12px] font-semibold">{file.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{bitmap.width}×{bitmap.height}</span>
              <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{selected.size} selected</span>
              <button type="button" onClick={() => { setFile(null); bitmap.close(); setBitmap(null); }}
                className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Change
              </button>
            </div>

            {previewUrl && (
              <div className="overflow-hidden border border-black/[0.08] bg-black/5">
                <img src={previewUrl} alt="" className="block h-auto max-h-[280px] w-full object-contain" />
              </div>
            )}

            <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
              {GROUPS.map((g) => (
                <div key={g} className="border-b border-black/[0.06] px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{g}</div>
                    <button type="button" onClick={() => selectAll(g)}
                      className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                      Select all
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SIZES.filter((s) => s.group === g).map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => toggleSize(s.value)}
                        onDoubleClick={() => void downloadOne(s.value)}
                        className={cn(
                          'group flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-mono tabular-nums transition',
                          selected.has(s.value)
                            ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                            : 'border-black/[0.08] text-[var(--color-fg)] hover:border-black/20',
                        )}
                      >
                        {selected.has(s.value) && <Check className="h-3 w-3" />}
                        {s.label}<span className="text-[9px] opacity-70">×{s.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2">
                <span className="text-[11px] text-[var(--color-fg-muted)]">Double-click any size to download just that one</span>
                <button type="button" onClick={clearAll}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(['png', 'jpeg', 'webp'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f === 'jpeg' ? 'JPG' : f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Fit</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['cover', 'contain'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFit(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${fit === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {(fit === 'contain' || format === 'jpeg') && (
                <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                  Background
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)}
                    className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
                </label>
              )}
              {format !== 'png' && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Quality</span>
                    <span className="font-mono text-[12px] tabular-nums">{Math.round(quality * 100)}%</span>
                  </div>
                  <input type="range" min={0.5} max={1} step={0.02} value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    className="mt-2 w-full" />
                </div>
              )}
            </div>

            <button type="button" onClick={downloadZip} disabled={busy || !selected.size}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Build {selected.size} sizes ZIP
            </button>

            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
