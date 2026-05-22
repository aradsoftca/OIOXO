'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { gain, peakAmplitude, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [db, setDb] = React.useState(0);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const multiplier = Math.pow(10, db / 20);
  const peakAfter = item ? peakAmplitude(item.buffer) * multiplier : 0;
  const willClip = peakAfter > 1;

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const out = gain(item.buffer, multiplier);
      const blob = await encodeAudio(out, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-vol${db >= 0 ? '+' : ''}${db.toFixed(1)}dB.${format}`);
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

          <Waveform buffer={item.buffer} />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Volume change</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{db >= 0 ? '+' : ''}{db.toFixed(1)} dB</span>
                </div>
                <Slider.Root value={[db]} min={-30} max={30} step={0.5}
                  onValueChange={([v]) => setDb(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">
                  ×{multiplier.toFixed(3)} multiplier · {((multiplier - 1) * 100).toFixed(0)}% change
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[-12, -6, 0, 6].map((v) => (
                  <button key={v} type="button" onClick={() => setDb(v)}
                    className="border border-black/[0.08] py-2 text-[11px] font-mono tabular-nums hover:border-[var(--color-cat-audio)]">
                    {v > 0 ? '+' : ''}{v} dB
                  </button>
                ))}
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Peak after</div>
                <div className={`mt-1 font-mono text-[18px] tabular-nums font-bold ${willClip ? 'text-red-600' : ''}`}>
                  {(20 * Math.log10(Math.max(0.0001, peakAfter))).toFixed(1)} dB
                </div>
                {willClip && <div className="mt-1 text-[10px] text-red-600">Will clip — samples will be limited</div>}
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {(['wav', 'mp3'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Saving…' : 'Apply & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
