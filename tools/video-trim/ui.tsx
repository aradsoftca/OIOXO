'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { downloadBlob, fmtDuration } from '@/engines/video';
import { runFfmpeg, extOf, videoMimeForExt } from '@/engines/ffmpeg';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-trim';

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [range, setRange] = React.useState<[number, number]>([0, 0]);
  const [withAudio, setWithAudio] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const load = (it: VideoFileItem) => {
    setItem(it);
    setRange([0, it.info.duration]);
    setWithAudio(it.info.hasAudio);
  };

  const run = async () => {
    if (!item) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', item.file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    setBusy(true); setError(''); setProgress(0);
    try {
      const dur = range[1] - range[0];
      // ffmpeg stream copy (no re-encode, same container as the input). Was
      // MediaRecorder + captureStream -> WebM at playback speed, which never
      // produced a file on Safari/iOS. Copy cuts start on the nearest keyframe.
      // The free-tier brand mark comes from the ffmpeg engine's watermark pass.
      const ext = extOf(item.file.name) || 'mp4';
      const keepAudio = withAudio && item.info.hasAudio;
      const blob = await runFfmpeg({
        input: item.file, inputName: `in.${ext}`, outputName: `out.${ext}`,
        args: (i, o) => [
          '-ss', range[0].toFixed(3), '-i', i, '-t', dur.toFixed(3),
          '-map', '0:v?', ...(keepAudio ? ['-map', '0:a?'] : ['-an']),
          '-c', 'copy', '-avoid_negative_ts', 'make_zero', o,
        ],
        mimeType: videoMimeForExt(ext),
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-trim.${ext}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const dur = range[1] - range[0];

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

          <div className="border border-black/[0.08] bg-black aspect-video flex items-center justify-center">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={item.url} controls className="max-h-full max-w-full" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Selection</span>
                  <span className="font-mono text-[12px] tabular-nums">{fmtDuration(range[0])} → {fmtDuration(range[1])}</span>
                </div>
                <Slider.Root value={range} min={0} max={item.info.duration} step={0.05} minStepsBetweenThumbs={0.5}
                  onValueChange={(v) => setRange([v[0], v[1]])}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">{dur.toFixed(2)}s output</div>
              </div>
              {item.info.hasAudio && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-cat-video)]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Keep audio</span>
                </label>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
                <div className="mt-1 text-[14px] font-semibold">{dur.toFixed(2)}s · {(extOf(item.file.name) || 'mp4').toUpperCase()}</div>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Same format as your file, no re-encoding. The cut starts on the nearest keyframe.</div>
              </div>
              <button type="button" onClick={run} disabled={busy || dur <= 0}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Trimming… ${progress}%` : 'Trim & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
