'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { trim, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [range, setRange] = React.useState<[number, number]>([0, 0]);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = (it: AudioFileItem) => {
    setItem(it);
    setRange([0, it.info.duration]);
  };

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const cut = trim(item.buffer, range[0], range[1]);
      const blob = await encodeAudio(cut, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-trimmed.' + format);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const dur = range[1] - range[0];

  return (
    <div className="space-y-4">
      {!item && <AudioDrop loaded={false} onLoad={load} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {item.info.sampleRate} Hz · {item.info.channels}ch</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <Waveform buffer={item.buffer} selection={{ start: range[0], end: range[1] }} />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Selection</span>
                  <span className="font-mono text-[12px] tabular-nums">
                    {range[0].toFixed(2)}s → {range[1].toFixed(2)}s
                  </span>
                </div>
                <Slider.Root value={range} min={0} max={item.info.duration} step={0.01} minStepsBetweenThumbs={1}
                  onValueChange={(v) => setRange([v[0], v[1]])}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Start (s)</div>
                  <input type="number" value={range[0].toFixed(2)} step={0.01} min={0} max={range[1] - 0.01}
                    onChange={(e) => setRange([Math.min(Number(e.target.value), range[1] - 0.01), range[1]])}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-audio)]" />
                </label>
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">End (s)</div>
                  <input type="number" value={range[1].toFixed(2)} step={0.01} min={range[0] + 0.01} max={item.info.duration}
                    onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + 0.01)])}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-audio)]" />
                </label>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
                <div className="mt-1 font-mono text-[18px] tabular-nums font-bold">{dur.toFixed(2)}s</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['wav', 'mp3'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy || dur <= 0}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Trimming…' : 'Trim & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
