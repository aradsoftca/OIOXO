'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { seekTo, captureFrame, framesToGif, downloadBlob, fmtDuration } from '@/engines/video';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { ProBadge } from '@/components/limits/ProBadge';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { shouldWatermarkHere, WM_DOMAIN } from '@/lib/watermark/config';

const POLICY_KEY = 'video-to-gif';

const WIDTHS = [320, 480, 640, 800];
const FPS_OPTIONS = [10, 15, 20, 24];

/** gif.js encodes raw canvas pixels and never hits the toBlob/toDataURL canvas
 *  patch, so a free GIF would ship CLEAN. Stamp the brand domain bottom-right on
 *  each frame in place BEFORE encoding — same corner-mark style as the universal
 *  canvas watermark (600-weight, ~2.6% width, white, alpha 0.55, soft shadow). */
function stampFrameBrand(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const fontPx = Math.max(12, Math.round(w * 0.026));
  const pad = Math.round(w * 0.02);
  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.55;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.18));
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(WM_DOMAIN, w - pad, canvas.height - pad);
  ctx.restore();
}

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
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
    const clipDur = range[1] - range[0];
    const durHit = checkLever(POLICY_KEY, 'input-duration', clipDur, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    const resHit = checkLever(POLICY_KEY, 'output-resolution', width, isPro);
    if (resHit) { policyGate.fire(resHit); return; }
    setBusy(true); setError(''); setProgress(0);
    try {
      const duration = range[1] - range[0];
      const totalFrames = Math.max(2, Math.floor(duration * fps));
      const frames: HTMLCanvasElement[] = [];
      const scale = width / item.info.width;
      // Free sessions brand every frame; Pro / clean-intent leaves them untouched.
      const brand = shouldWatermarkHere();
      for (let i = 0; i < totalFrames; i++) {
        const t = range[0] + (i / Math.max(1, totalFrames - 1)) * duration;
        await seekTo(item.video, t);
        const frame = captureFrame(item.video, scale);
        if (brand) stampFrameBrand(frame);
        frames.push(frame);
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
      {policyGate.element}
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
                      className={`relative border py-2 text-[11px] font-mono tabular-nums transition ${width === w ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      <div className="absolute right-0.5 top-0.5"><ProBadge toolKey={POLICY_KEY} lever="output-resolution" value={w} isPro={isPro} compact /></div>
                      {w}px
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <aside>
              <FfmpegRunButton colorVar="--color-cat-video" busy={busy} progress={progress}
                disabled={clipDur <= 0} label="Build & Download GIF" busyLabel="Building…"
                onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
