'use client';
import * as React from 'react';
import { Upload, Download, Loader2, X, ClipboardPaste, Archive } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useImageInput } from '@/components/tool/useImageInput';

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
  const [zipping, setZipping] = React.useState(false);
  const [previews, setPreviews] = React.useState<Map<string, string>>(new Map());
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Ref-mirror the previews so the unmount cleanup reads the LATEST set,
  // not the empty initial Map captured at mount. Each render generates ~12
  // social-size variants; without this the whole set leaked on every nav.
  const previewsRef = React.useRef<Map<string, string>>(new Map());
  React.useEffect(() => { previewsRef.current = previews; }, [previews]);
  React.useEffect(() => () => {
    previewsRef.current.forEach((u) => URL.revokeObjectURL(u));
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

  const clear = React.useCallback(() => {
    if (bitmap) bitmap.close();
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(new Map());
    setBitmap(null);
    setFile(null);
  }, [bitmap, previews]);

  // Paste a screenshot, drop anywhere on the tool, Esc to clear.
  const { dragging, dropZoneProps } = useImageInput({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    disabled: busy,
  });

  const download = (size: Size) => {
    const url = previews.get(size.id);
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace(/\.[^.]+$/, '')}-${size.id}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Download every rendered size in one ZIP — the single biggest time-saver for
  // someone shipping a launch across platforms (rivals make you save 12 times).
  const downloadAll = React.useCallback(async () => {
    if (!file || previews.size === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const base = file.name.replace(/\.[^.]+$/, '');
      for (const cat of PRESETS) {
        for (const s of cat.sizes) {
          const url = previews.get(s.id);
          if (!url) continue;
          const blob = await (await fetch(url)).blob();
          zip.file(`${base}-${s.id}.jpg`, blob);
        }
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const u = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = u;
      a.download = `${base}-social-sizes.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } finally {
      setZipping(false);
    }
  }, [file, previews]);

  return (
    <div className="relative space-y-4" {...dropZoneProps}>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-[var(--color-cat-social)] bg-[var(--color-cat-social)]/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 bg-[var(--color-cat-social)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg">
            <Upload className="h-4 w-4" /> Drop to resize for every platform
          </div>
        </div>
      )}
      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="grid aspect-[3/1] cursor-pointer place-items-center border border-dashed border-black/[0.15] bg-[oklch(20%_0.008_250)] text-center transition hover:border-[var(--color-cat-social)]"
        >
          <div>
            <Upload className="mx-auto h-7 w-7 text-white/70" />
            <div className="mt-2 text-[16px] font-semibold text-white">Drop, paste, or click to add an image</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-white/55">
              <ClipboardPaste className="h-3 w-3" /> Paste a screenshot · high-res landscape works best · center-crop is automatic
            </div>
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] text-[var(--color-fg-muted)]">{file.name}  ·  {bitmap?.width}×{bitmap?.height}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadAll} disabled={busy || zipping || previews.size === 0}
              className="flex items-center gap-1.5 bg-[var(--color-cat-social)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              {zipping ? 'Zipping…' : 'Download all (ZIP)'}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="border border-black/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-[var(--color-surface-2)]">
              Replace
            </button>
            <button type="button" onClick={clear} title="Clear (Esc)" className="flex h-[30px] w-[30px] items-center justify-center border border-black/[0.08] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
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
