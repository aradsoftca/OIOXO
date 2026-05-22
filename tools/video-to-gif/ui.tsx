'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { seekTo, captureFrame, framesToGif, downloadBlob, fmtDuration } from '@/engines/video';

const WIDTHS = [320, 480, 640, 800];
const FPS_OPTIONS = [10, 15, 20, 24];

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [range, setRange] = React.useState<[number, number]>([0, 0]);
  const [fps, setFps] = React.useState(15);
  const [width, setWidth] = React.useState(480);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => () => {
    if (item?.url) URL.revokeObjectURL(item.url);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [item, previewUrl]);

  const load = (it: VideoFileItem) => {
    setItem(it);
    setRange([0, Math.min(5, it.info.duration)]);
    setWidth(Math.min(640, it.info.width));
  };

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const duration = range[1] - range[0];
      const totalFrames = Math.max(2, Math.floor(duration * fps));
      const frames: HTMLCanvasElement[] = [];
      const scale = width / item.info.width;
      for (let i = 0; i < totalFrames; i++) {
        const t = range[0] + (i / Math.max(1, totalFrames - 1)) * duration;
        await seekTo(item.video, t);
        frames.push(captureFrame(item.video, scale));
        setProgress(Math.round((i + 1) / totalFrames * 50));
      }
      setProgress(50);
      const delay = Math.round(1000 / fps);
      const gif = await framesToGif(frames, delay, 10);
      setProgress(100);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const u = URL.createObjectURL(gif);
      setPreviewUrl(u);
      downloadBlob(gif, item.file.name.replace(/\.[^.]+$/, '') + '.gif');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const clipDur = range[1] - range[0];
  const estFrames = Math.max(2, Math.floor(clipDur * fps));

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={load} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)} · {item.info.width}×{item.info.height}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          {previewUrl && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-2)] aspect-video flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="gif preview" className="max-h-full max-w-full" />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Range</span>
                  <span className="font-mono text-[12px] tabular-nums">{fmtDuration(range[0])} → {fmtDuration(range[1])}</span>
                </div>
                <Slider.Root value={range} min={0} max={item.info.duration} step={0.05} minStepsBetweenThumbs={1}
                  onValueChange={(v) => setRange([v[0], v[1]])}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">{clipDur.toFixed(2)}s · {estFrames} frames</div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Frame rate</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {FPS_OPTIONS.map((f) => (
                    <button key={f} type="button" onClick={() => setFps(f)}
                      className={`border py-2 text-[11px] font-mono tabular-nums transition ${fps === f ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f}fps
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Width</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {WIDTHS.map((w) => (
                    <button key={w} type="button" onClick={() => setWidth(w)}
                      className={`border py-2 text-[11px] font-mono tabular-nums transition ${width === w ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {w}px
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <aside>
              <button type="button" onClick={run} disabled={busy || clipDur <= 0}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Building… ${progress}%` : 'Build & Download GIF'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
