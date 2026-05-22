'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, Loader2, FileImage, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';

type Target = 'image/jpeg' | 'image/png' | 'image/webp';
const FORMATS: { id: Target; label: string; ext: string; lossy: boolean }[] = [
  { id: 'image/jpeg', label: 'JPG',  ext: 'jpg',  lossy: true },
  { id: 'image/png',  label: 'PNG',  ext: 'png',  lossy: false },
  { id: 'image/webp', label: 'WebP', ext: 'webp', lossy: true },
];

interface Item {
  id: string;
  name: string;
  status: 'pending' | 'done' | 'error';
  url?: string;
  outBytes?: number;
  inBytes: number;
  error?: string;
}

function formatBytes(b: number): string {
  if (b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

export default function HeicConvertTool() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [target, setTarget] = React.useState<Target>('image/jpeg');
  const [quality, setQuality] = React.useState(90);
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const urlsRef = React.useRef<string[]>([]);

  React.useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const meta = FORMATS.find((f) => f.id === target)!;

  const convertAll = React.useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const { heicTo, isHeic } = await import('heic-to/next');
    const base: Item[] = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, status: 'pending', inBytes: f.size }));
    setItems(base);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        // Some Android/edge exports are HEIC without the right extension — verify.
        const heic = /\.(heic|heif)$/i.test(f.name) || (await isHeic(f).catch(() => false));
        if (!heic) throw new Error('Not a HEIC/HEIF image');
        const blob = await heicTo({ blob: f, type: target, quality: quality / 100 });
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        setItems((prev) => prev.map((it, j) => j === i ? { ...it, status: 'done', url, outBytes: blob.size } : it));
        if (i === 0) {
          const thumb = await makeThumb(blob);
          if (thumb) setRecent('image-heic-convert', thumb);
        }
      } catch (e) {
        setItems((prev) => prev.map((it, j) => j === i ? { ...it, status: 'error', error: (e as Error).message } : it));
      }
    }
    setBusy(false);
  }, [target, quality]);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    void convertAll(Array.from(list));
  };

  const downloadOne = (it: Item) => {
    if (!it.url) return;
    const a = document.createElement('a');
    a.href = it.url;
    a.download = `${it.name.replace(/\.[^.]+$/, '')}.${meta.ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadAll = () => items.filter((i) => i.status === 'done').forEach(downloadOne);

  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div
          onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className={cn('flex min-h-[200px] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]', items.length && 'min-h-[120px]')}
        >
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 py-8 text-center">
            <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">Drop HEIC photos here</div>
              <div className="mt-1 text-[13px] text-white/55">.heic · .heif — convert one or many · files stay yours</div>
            </div>
            <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
          </button>
          <input ref={fileInputRef} type="file" accept=".heic,.heif,image/heic,image/heif" multiple className="hidden"
            onChange={(e) => onPick(e.target.files)} />
        </div>

        {items.length > 0 && (
          <div className="divide-y divide-black/[0.06] border border-black/[0.08] bg-[var(--color-surface-1)]">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileImage className="h-4 w-4 shrink-0 text-[var(--color-cat-image)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{it.name}</div>
                  <div className="text-[11px] text-[var(--color-fg-subtle)]">
                    {it.status === 'done' && <>{formatBytes(it.inBytes)} → {formatBytes(it.outBytes ?? 0)}</>}
                    {it.status === 'pending' && 'Converting…'}
                    {it.status === 'error' && <span className="text-red-600">{it.error}</span>}
                  </div>
                </div>
                {it.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-fg-muted)]" />}
                {it.status === 'done' && (
                  <button type="button" onClick={() => downloadOne(it)}
                    className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
                    <Download className="h-3 w-3" /> .{meta.ext}
                  </button>
                )}
                {it.status === 'error' && <X className="h-4 w-4 text-red-500" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="space-y-1.5">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Convert to</div>
          {FORMATS.map((f) => (
            <button key={f.id} type="button" onClick={() => setTarget(f.id)}
              className={cn('flex w-full items-center justify-between border px-3 py-2.5 text-left transition',
                target === f.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] bg-[var(--color-surface-1)] text-[var(--color-fg)] hover:border-black/20')}>
              <span className="text-[13px] font-bold">{f.label}</span>
              {target === f.id && <span className="text-[18px] leading-none">→</span>}
            </button>
          ))}
        </div>

        {meta.lossy && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-baseline justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Quality</label>
              <span className="font-mono text-[18px] font-semibold tabular-nums text-[var(--color-fg)]">{quality}</span>
            </div>
            <Slider.Root value={[quality]} onValueChange={([v]) => setQuality(v)} min={20} max={100} step={1}
              className="relative mt-3 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
              <Slider.Thumb className="block h-5 w-5 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)] outline-none" />
            </Slider.Root>
            <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">Re-convert after changing format or quality.</p>
          </div>
        )}

        {doneCount > 1 && (
          <button type="button" onClick={downloadAll}
            className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110">
            <Download className="h-4 w-4" /> Download all ({doneCount})
          </button>
        )}

        {items.length > 0 && !busy && (
          <div className="flex items-center gap-2 bg-black/[0.03] px-3 py-2.5 text-[11px] text-[var(--color-fg-muted)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-cat-image)]" />
            {doneCount} of {items.length} converted — nothing left your device.
          </div>
        )}
      </aside>
    </div>
  );
}

async function makeThumb(blob: Blob): Promise<string> {
  try {
    const bm = await createImageBitmap(blob);
    const max = 192, scale = Math.min(1, max / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale)), h = Math.max(1, Math.round(bm.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return '';
    ctx.drawImage(bm, 0, 0, w, h); bm.close();
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return ''; }
}
