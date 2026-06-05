'use client';

import * as React from 'react';
import { Upload, Download, Loader2, ShieldCheck, MapPin, AlertTriangle, FileImage } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { stripMetadata, readMetadata, type MetaSummary } from '@/engines/metadata';
import { useImageDrop } from '@/lib/compute/useImageDrop';

function formatBytes(b: number): string {
  if (b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

export default function RemoveMetadataTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [meta, setMeta] = React.useState<MetaSummary | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [out, setOut] = React.useState<{ url: string; bytes: number; lossless: boolean } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const load = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setBusy(true); setMeta(null); setOut(null); setFile(next);
    try {
      const [summary, stripped] = await Promise.all([readMetadata(next), stripMetadata(next)]);
      setMeta(summary);
      const url = URL.createObjectURL(stripped.blob);
      setOut({ url, bytes: stripped.outBytes, lossless: stripped.lossless });
      const thumb = await makeThumb(stripped.blob);
      if (thumb) setRecent('image-remove-metadata', thumb);
    } catch (e) {
      console.error('strip failed', e);
    } finally {
      setBusy(false);
    }
  }, []);

  const download = () => {
    if (!out || !file) return;
    const a = document.createElement('a');
    a.href = out.url;
    const ext = file.name.match(/\.[^.]+$/)?.[0] ?? '.jpg';
    a.download = `${file.name.replace(/\.[^.]+$/, '')}-clean${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const clear = React.useCallback(() => {
    setOut((o) => { if (o?.url) URL.revokeObjectURL(o.url); return null; });
    setFile(null);
    setMeta(null);
  }, []);

  // Clipboard paste, drag-anywhere hover state, Esc to clear, Enter to download.
  const downloadRef = React.useRef<() => void>(() => {});
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void load(f),
    onClear: file ? clear : undefined,
    onRun: out && !busy ? () => downloadRef.current() : undefined,
  });
  downloadRef.current = download;

  const foundCount = meta?.rows.length ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div
        {...dropZone}
        className={cn(
          'relative flex aspect-[4/3] items-center justify-center overflow-hidden border bg-[oklch(20%_0.008_250)] transition-colors',
          dragging ? 'border-2 border-dashed border-[var(--color-cat-image)]' : 'border border-black/[0.08]',
        )}
      >
        {file && dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="border-2 border-dashed border-white/70 px-5 py-3 text-[14px] font-semibold text-white">Drop to replace</div>
          </div>
        )}
        {!file ? (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">Drop, paste or click to clean</div>
              <div className="mt-1 text-[13px] text-white/55">JPG · PNG · WebP — files never leave your device</div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <span className="border border-white/10 px-3 py-1.5">browse</span>
              <span className="text-white/40">or paste a screenshot</span>
            </div>
          </button>
        ) : (
          <>
            {out && <img src={out.url} alt="cleaned" className="absolute inset-0 h-full w-full object-contain" />}
            {busy && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading & stripping…
              </div>
            )}
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
      </div>

      <aside className="space-y-4">
        {meta && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              {meta.hasGps ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-cat-image)]" />}
              {foundCount > 0 ? `Metadata found (${foundCount})` : 'No metadata found'}
            </div>
            {foundCount > 0 ? (
              <dl className="divide-y divide-black/[0.04]">
                {meta.rows.map((r) => (
                  <div key={r.key} className="flex items-start justify-between gap-3 px-4 py-2">
                    <dt className="flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
                      {r.key === 'GPS location' && <MapPin className="h-3 w-3 text-amber-500" />}{r.key}
                    </dt>
                    <dd className="truncate text-right font-mono text-[12px] text-[var(--color-fg)]">{r.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="px-4 py-3 text-[12px] text-[var(--color-fg-subtle)]">This image carried no readable EXIF — the cleaned copy is still re-saved without any hidden data.</div>
            )}
          </div>
        )}

        {out && (
          <div className="flex items-center gap-2 bg-[var(--color-cat-image)]/[0.08] px-4 py-3 text-[12px] text-[var(--color-fg)]">
            <ShieldCheck className="h-4 w-4 text-[var(--color-cat-image)]" />
            <span>Cleaned · {formatBytes(out.bytes)}{file ? ` (was ${formatBytes(file.size)})` : ''}{out.lossless ? ' · pixels untouched' : ''}</span>
          </div>
        )}

        <button type="button" onClick={download} disabled={!out || busy}
          className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            out && !busy ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download clean image
        </button>

        {file && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <FileImage className="h-4 w-4" /> Clean another
          </button>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
          JPEG and PNG are stripped losslessly — your photo&apos;s pixels and colour profile are kept byte-for-byte; only GPS, camera, timestamp and other hidden tags are removed.
        </p>
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
