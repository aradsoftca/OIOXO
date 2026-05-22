'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { extractFrames, blobsToZip, downloadBlob, fmtDuration } from '@/engines/video';

type Format = 'png' | 'jpg';

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [count, setCount] = React.useState(12);
  const [format, setFormat] = React.useState<Format>('jpg');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const blobs = await extractFrames(item.video, count, 1, mime);
      const baseName = item.file.name.replace(/\.[^.]+$/, '');
      const zipBlob = await blobsToZip(blobs.map((b, i) => ({
        name: `${baseName}-frame-${String(i + 1).padStart(3, '0')}.${format}`,
        blob: b,
      })));
      downloadBlob(zipBlob, `${baseName}-frames.zip`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const interval = item ? item.info.duration / Math.max(1, count - 1) : 0;

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)} · {item.info.width}×{item.info.height}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Number of frames</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{count}</span>
                </div>
                <Slider.Root value={[count]} min={2} max={200} step={1}
                  onValueChange={([v]) => setCount(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">~{interval.toFixed(2)}s between frames</div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[4, 12, 24, 60].map((v) => (
                  <button key={v} type="button" onClick={() => setCount(v)}
                    className="border border-black/[0.08] py-2 text-[11px] font-mono tabular-nums hover:border-[var(--color-cat-video)]">
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['jpg', 'png'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Extracting…' : 'Extract & Download ZIP'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
