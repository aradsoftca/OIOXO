'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [bright, setBright] = React.useState(0);     // -1 .. 1
  const [contrast, setContrast] = React.useState(1); // 0 .. 2
  const [satur, setSatur] = React.useState(1);       // 0 .. 3
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const filter = `eq=brightness=${bright.toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${satur.toFixed(2)}`;
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-vf', filter, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-graded.mp4');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const SliderRow = ({ label, value, min, max, step, fmt, onChange }: {
    label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void;
  }) => (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
        <span className="font-mono text-[14px] tabular-nums font-bold">{fmt(value)}</span>
      </div>
      <Slider.Root value={[value]} min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
        className="relative mt-2 flex h-5 w-full touch-none items-center">
        <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
        <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
      </Slider.Root>
    </div>
  );

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height} · {fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <SliderRow label="Brightness" value={bright} min={-1} max={1} step={0.05} fmt={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} onChange={setBright} />
              <SliderRow label="Contrast"   value={contrast} min={0} max={2} step={0.05} fmt={(v) => v.toFixed(2) + '×'} onChange={setContrast} />
              <SliderRow label="Saturation" value={satur} min={0} max={3} step={0.05} fmt={(v) => v.toFixed(2) + '×'} onChange={setSatur} />
              <button type="button" onClick={() => { setBright(0); setContrast(1); setSatur(1); }}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Reset</button>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Apply & Download" busyLabel="Grading…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
