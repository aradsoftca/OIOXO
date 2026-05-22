'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

interface Mode { id: string; label: string; }
const MODES: Mode[] = [
  { id: 'ends',   label: 'Trim ends only' },
  { id: 'all',    label: 'Remove all silence' },
];

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [mode, setMode] = React.useState(MODES[0]);
  const [threshold, setThreshold] = React.useState(-40); // dB
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const thr = `${threshold}dB`;
      // ends: silenceremove with start + reverse + start to also trim tail
      // all: silenceremove with stop_periods=-1
      const filter = mode.id === 'ends'
        ? `silenceremove=start_periods=1:start_duration=0.2:start_threshold=${thr}:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.2:start_threshold=${thr}:detection=peak,areverse`
        : `silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=${thr}:detection=peak`;
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3'),
        outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-af', filter, '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mp3',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-tight.mp3');
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
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">What to remove</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" onClick={() => setMode(m)}
                      className={`border py-3 text-[12px] font-bold transition ${mode.id === m.id ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Silence threshold</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{threshold} dB</span>
                </div>
                <Slider.Root value={[threshold]} min={-60} max={-20} step={1}
                  onValueChange={([v]) => setThreshold(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Lower = more aggressive. -40 dB is a safe default for clean recordings.</div>
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="audio" colorVar="--color-cat-audio" busy={busy} progress={progress} label="Process & Download" busyLabel="Trimming…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
