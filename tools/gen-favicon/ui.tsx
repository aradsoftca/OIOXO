'use client';
import * as React from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = [16, 32, 48, 96, 128, 180, 192, 256, 512];

export default function Tool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [previews, setPreviews] = React.useState<Map<number, string>>(new Map());
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Mirror current URLs into refs so the unmount cleanup reads the LATEST
  // values, not the empty initial state. Previously the eslint-ignored empty
  // deps captured the initial '' / empty Map at mount, so the final loaded
  // file's preview URLs leaked on every navigation away.
  const sourceUrlRef = React.useRef('');
  const previewsRef = React.useRef<Map<number, string>>(new Map());
  React.useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);
  React.useEffect(() => { previewsRef.current = previews; }, [previews]);
  React.useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    previewsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setBusy(true);
    try {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      previews.forEach((u) => URL.revokeObjectURL(u));
      const url = URL.createObjectURL(next);
      setSourceUrl(url);
      setFile(next);

      const bm = await createImageBitmap(next);
      const out = new Map<number, string>();
      for (const size of SIZES) {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.imageSmoothingQuality = 'high';
        // Letterbox to square keeping aspect.
        const scale = Math.min(size / bm.width, size / bm.height);
        const w = bm.width * scale, h = bm.height * scale;
        ctx.drawImage(bm, (size - w) / 2, (size - h) / 2, w, h);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) out.set(size, URL.createObjectURL(blob));
      }
      bm.close();
      setPreviews(out);
    } catch (err) {
      console.error('favicon generation failed', err);
    } finally {
      setBusy(false);
    }
  }, [sourceUrl, previews]);

  // Paste a screenshot or copied image straight into the tool — no need to save
  // it to disk first. Ignored while editing a text field.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const img = item?.getAsFile();
      if (img) { e.preventDefault(); void loadFile(img); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const downloadOne = (size: number) => {
    const url = previews.get(size);
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `favicon-${size}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={cn(
          'relative flex aspect-[3/1] items-center justify-center border bg-[oklch(20%_0.008_250)] transition',
          dragOver ? 'border-[var(--color-cat-generator)] ring-2 ring-[var(--color-cat-generator)]/40' : 'border-black/[0.08]',
          file ? '' : 'cursor-pointer',
        )}
        onClick={() => !file && inputRef.current?.click()}
      >
        {!file && (
          <div className="text-center">
            <Upload className="mx-auto h-7 w-7 text-white/70" />
            <div className="mt-2 text-[16px] font-semibold text-white">Drop, paste, or click to add a square logo</div>
            <div className="mt-1 text-[12px] text-white/55">PNG, JPG, WebP, SVG · or paste a screenshot — files stay yours</div>
          </div>
        )}
        {file && sourceUrl && (
          <img src={sourceUrl} alt="source" className="h-full w-auto object-contain" />
        )}
        {file && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="absolute right-2 top-2 inline-flex items-center gap-1 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-black/75"
          >
            <Upload className="h-3 w-3" /> Replace
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
        </div>
      )}

      {previews.size > 0 && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-9">
          {SIZES.map((size) => {
            const url = previews.get(size);
            if (!url) return null;
            return (
              <button
                key={size}
                type="button"
                onClick={() => downloadOne(size)}
                className="group border border-black/[0.08] bg-[var(--color-surface-1)] p-3 transition hover:border-[var(--color-cat-generator)]"
                title={`Download ${size}×${size}`}
              >
                <div className="flex aspect-square items-center justify-center bg-[oklch(20%_0.008_250)]">
                  <img src={url} alt={`${size}px`} className="max-h-full max-w-full" style={{ imageRendering: size <= 32 ? 'pixelated' : 'auto' }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[var(--color-fg)]">{size}px</span>
                  <Download className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
