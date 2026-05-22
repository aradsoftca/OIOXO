'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { extractFrameAt, seekTo, downloadBlob, fmtDuration } from '@/engines/video';

type Format = 'png' | 'jpg';

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [time, setTime] = React.useState(0);
  const [format, setFormat] = React.useState<Format>('jpg');
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const previewRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const run = async () => {
      try {
        await seekTo(item.video, time);
        if (cancelled) return;
        const blob = await extractFrameAt(item.video, time, 1, 'image/jpeg', 0.85);
        const u = URL.createObjectURL(blob);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = u;
        setPreviewUrl(u);
      } catch (e) { setError((e as Error).message); }
    };
    void run();
    return () => { cancelled = true; };
  }, [item, time]);

  React.useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (item?.url) URL.revokeObjectURL(item.url);
  }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await extractFrameAt(item.video, time, 1, mime, 0.92);
      const t = fmtDuration(time).replace(':', 'm') + 's';
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-${t}.${format}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={(it) => { setItem(it); setTime(0); }} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="border border-black/[0.08] bg-black flex items-center justify-center aspect-video">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previewUrl && <img src={previewUrl} alt="frame preview" className="max-h-full max-w-full" />}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Time</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{fmtDuration(time)}</span>
                </div>
                <Slider.Root value={[time]} min={0} max={item.info.duration} step={0.05}
                  onValueChange={([v]) => setTime(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
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
                {busy ? 'Saving…' : 'Save Frame'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
