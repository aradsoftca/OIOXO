'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

/** Build chained 'atempo' filters since each must be 0.5–2.0. */
function atempoChain(factor: number): string {
  let f = factor;
  const parts: string[] = [];
  while (f > 2.0) { parts.push('atempo=2.0'); f /= 2.0; }
  while (f < 0.5) { parts.push('atempo=0.5'); f /= 0.5; }
  parts.push(`atempo=${f.toFixed(4)}`);
  return parts.join(',');
}

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [factor, setFactor] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const newDur = item ? item.info.duration / factor : 0;

  const run = async () => {
    if (!item || factor === 1) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const ptsRate = (1 / factor).toFixed(6);
      const aChain = atempoChain(factor);
      const args = item.info.hasAudio
        ? ['-i', '__in__', '-filter_complex', `[0:v]setpts=${ptsRate}*PTS[v];[0:a]${aChain}[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', '__out__']
        : ['-i', '__in__', '-filter_complex', `[0:v]setpts=${ptsRate}*PTS[v]`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', '__out__'];
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => args.map((a) => a === '__in__' ? i : a === '__out__' ? o : a),
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-${factor.toFixed(2)}x.mp4`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Speed</span>
                  <span className="font-mono text-[16px] tabular-nums font-bold">{factor.toFixed(2)}×</span>
                </div>
                <Slider.Root value={[factor]} min={0.25} max={4} step={0.05}
                  onValueChange={([v]) => setFactor(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[0.5, 0.75, 1, 1.5, 2].map((v) => (
                  <button key={v} type="button" onClick={() => setFactor(v)}
                    className="border border-black/[0.08] py-2 text-[11px] font-mono tabular-nums hover:border-[var(--color-cat-video)]">
                    {v}×
                  </button>
                ))}
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">New duration</div>
                <div className="mt-1 font-mono text-[18px] tabular-nums font-bold">{fmtDuration(newDur)}</div>
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Change Speed" busyLabel="Re-timing…" onClick={run} error={error} disabled={factor === 1} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
