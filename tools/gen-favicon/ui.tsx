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
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'flex aspect-[3/1] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]',
          file ? '' : 'cursor-pointer',
        )}
        onClick={() => !file && inputRef.current?.click()}
      >
        {!file && (
          <div className="text-center">
            <Upload className="mx-auto h-7 w-7 text-white/70" />
            <div className="mt-2 text-[16px] font-semibold text-white">Drop a square logo or icon</div>
            <div className="mt-1 text-[12px] text-white/55">PNG, JPG, WebP, SVG — files stay yours</div>
          </div>
        )}
        {file && sourceUrl && (
          <img src={sourceUrl} alt="source" className="h-full w-auto object-contain" />
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
