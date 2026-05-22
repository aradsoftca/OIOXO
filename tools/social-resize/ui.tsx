'use client';
import * as React from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Size { id: string; label: string; w: number; h: number }

const PRESETS: Array<{ category: string; sizes: Size[] }> = [
  {
    category: 'Instagram',
    sizes: [
      { id: 'ig-square',   label: 'Square post',    w: 1080, h: 1080 },
      { id: 'ig-portrait', label: 'Portrait post',  w: 1080, h: 1350 },
      { id: 'ig-story',    label: 'Story / Reels',  w: 1080, h: 1920 },
      { id: 'ig-cover',    label: 'Highlight cover', w: 1080, h: 1920 },
    ],
  },
  {
    category: 'X / Twitter',
    sizes: [
      { id: 'x-post',   label: 'Post image', w: 1600, h: 900 },
      { id: 'x-header', label: 'Header',     w: 1500, h: 500 },
      { id: 'x-card',   label: 'Summary card', w: 1200, h: 628 },
    ],
  },
  {
    category: 'LinkedIn',
    sizes: [
      { id: 'li-cover',   label: 'Cover photo',  w: 1584, h: 396 },
      { id: 'li-company', label: 'Company cover', w: 1128, h: 191 },
      { id: 'li-post',    label: 'Post image',   w: 1200, h: 627 },
    ],
  },
  {
    category: 'Facebook',
    sizes: [
      { id: 'fb-cover', label: 'Cover',       w: 1640, h: 859 },
      { id: 'fb-post',  label: 'Shared post', w: 1200, h: 630 },
    ],
  },
  {
    category: 'YouTube',
    sizes: [
      { id: 'yt-thumb',   label: 'Thumbnail', w: 1280, h: 720 },
      { id: 'yt-banner',  label: 'Channel banner', w: 2560, h: 1440 },
    ],
  },
  {
    category: 'Open Graph',
    sizes: [
      { id: 'og',  label: 'Standard OG', w: 1200, h: 630 },
    ],
  },
];

function coverFit(srcW: number, srcH: number, dstW: number, dstH: number): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sh = srcH;
    const sw = Math.round(srcH * dstRatio);
    return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh };
  }
  const sw = srcW;
  const sh = Math.round(srcW / dstRatio);
  return { sx: 0, sy: Math.round((srcH - sh) / 2), sw, sh };
}

export default function Tool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [previews, setPreviews] = React.useState<Map<string, string>>(new Map());
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = React.useCallback(async (bm: ImageBitmap) => {
    setBusy(true);
    const out = new Map<string, string>();
    for (const cat of PRESETS) {
      for (const size of cat.sizes) {
        const c = document.createElement('canvas');
        c.width = size.w; c.height = size.h;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        const { sx, sy, sw, sh } = coverFit(bm.width, bm.height, size.w, size.h);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bm, sx, sy, sw, sh, 0, 0, size.w, size.h);
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
        if (blob) out.set(size.id, URL.createObjectURL(blob));
      }
    }
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(out);
    setBusy(false);
  }, [previews]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setFile(next);
    const bm = await createImageBitmap(next);
    if (bitmap) bitmap.close();
    setBitmap(bm);
    void render(bm);
  }, [bitmap, render]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const download = (size: Size) => {
    const url = previews.get(size.id);
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace(/\.[^.]+$/, '')}-${size.id}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="grid aspect-[3/1] cursor-pointer place-items-center border border-dashed border-black/[0.15] bg-[oklch(20%_0.008_250)] text-center"
        >
          <div>
            <Upload className="mx-auto h-7 w-7 text-white/70" />
            <div className="mt-2 text-[16px] font-semibold text-white">Drop a source image</div>
            <div className="mt-1 text-[12px] text-white/55">Best results with high-res landscape — center-crop is automatic</div>
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-[var(--color-fg-muted)]">{file.name}  ·  {bitmap?.width}×{bitmap?.height}</div>
          <button type="button" onClick={() => inputRef.current?.click()} className="border border-black/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-[var(--color-surface-2)]">
            Replace
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Rendering all sizes…</div>
      )}

      {file && PRESETS.map((cat) => (
        <section key={cat.category} className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{cat.category}</div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cat.sizes.map((s) => {
              const url = previews.get(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => download(s)}
                  disabled={!url}
                  className={cn(
                    'group border border-black/[0.08] bg-[var(--color-surface-1)] p-2 text-left transition disabled:opacity-50',
                    url && 'hover:border-[var(--color-cat-social)]',
                  )}
                >
                  <div className="grid aspect-[3/2] place-items-center overflow-hidden bg-[oklch(20%_0.008_250)]">
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={s.label} className="max-h-full max-w-full" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <div>
                      <div className="font-semibold text-[var(--color-fg)]">{s.label}</div>
                      <div className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{s.w} × {s.h}</div>
                    </div>
                    <Download className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
