'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [gain, setGain] = React.useState(6);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  const run = async () => {
    if (!item || gain === 0) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3'),
        outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-af', `treble=g=${gain}`, '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mp3',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-treble${gain >= 0 ? '+' : ''}${gain}.mp3`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Boost</span>
                  <span className="font-mono text-[16px] tabular-nums font-bold">{gain > 0 ? '+' : ''}{gain} dB</span>
                </div>
                <Slider.Root value={[gain]} min={-12} max={20} step={1}
                  onValueChange={([v]) => setGain(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Negative values soften the highs.</div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[-6, 0, 3, 6, 12].map((v) => (
                  <button key={v} type="button" onClick={() => setGain(v)}
                    className="border border-black/[0.08] py-2 text-[11px] font-mono tabular-nums hover:border-[var(--color-cat-audio)]">
                    {v > 0 ? '+' : ''}{v}
                  </button>
                ))}
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="audio" colorVar="--color-cat-audio" busy={busy} progress={progress} label="Apply & Download" busyLabel="Processing…" onClick={run} disabled={gain === 0} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
