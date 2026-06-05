'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

// Standard ISO 10-band graphic EQ (octave-spaced 31Hz–16kHz) — matches what
// Winamp/foobar/hardware graphic EQs use, vs the old 5 fixed bands.
interface Band { id: string; label: string; freq: number; width: number; }
const BANDS: Band[] = [
  { id: 'b31',   label: '31Hz',  freq: 31,    width: 22 },
  { id: 'b62',   label: '62Hz',  freq: 62,    width: 44 },
  { id: 'b125',  label: '125Hz', freq: 125,   width: 88 },
  { id: 'b250',  label: '250Hz', freq: 250,   width: 175 },
  { id: 'b500',  label: '500Hz', freq: 500,   width: 350 },
  { id: 'b1k',   label: '1kHz',  freq: 1000,  width: 700 },
  { id: 'b2k',   label: '2kHz',  freq: 2000,  width: 1400 },
  { id: 'b4k',   label: '4kHz',  freq: 4000,  width: 2800 },
  { id: 'b8k',   label: '8kHz',  freq: 8000,  width: 5600 },
  { id: 'b16k',  label: '16kHz', freq: 16000, width: 6000 },
];

interface Curve { id: string; label: string; gains: number[]; }
//                                       31  62 125 250 500  1k  2k  4k  8k 16k
const CURVES: Curve[] = [
  { id: 'flat',   label: 'Flat',        gains: [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { id: 'pop',    label: 'Pop',         gains: [-1,  0,  1,  2,  2,  0, -1,  1,  2,  2] },
  { id: 'rock',   label: 'Rock',        gains: [ 4,  3,  1, -1, -1,  0,  1,  3,  4,  4] },
  { id: 'vocal',  label: 'Vocal Boost', gains: [-3, -2, -1,  1,  3,  3,  2,  1,  0, -1] },
  { id: 'bass',   label: 'Bass Boost',  gains: [ 6,  5,  4,  2,  0,  0,  0,  0,  0,  0] },
  { id: 'treble', label: 'Treble Boost',gains: [ 0,  0,  0,  0,  0,  1,  2,  3,  4,  5] },
  { id: 'bright', label: 'Bright',      gains: [-2, -2, -1,  0,  0,  1,  2,  3,  4,  5] },
  { id: 'loud',   label: 'Loudness',    gains: [ 5,  4,  2,  0, -1,  0,  1,  2,  4,  5] },
];

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [gains, setGains] = React.useState<number[]>(() => BANDS.map(() => 0));
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  const setBand = (i: number, v: number) => setGains((g) => g.map((x, j) => j === i ? v : x));

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const chain = BANDS.map((b, i) => `equalizer=f=${b.freq}:width_type=h:width=${b.width}:g=${gains[i]}`).join(',');
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3'),
        outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-af', chain, '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mp3',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-eq.mp3');
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
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Preset curve</div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {CURVES.map((c) => (
                    <button key={c.id} type="button" onClick={() => setGains([...c.gains])}
                      className="border border-black/[0.08] py-2 text-[10px] font-bold hover:border-[var(--color-cat-audio)]">
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-4 pt-2">
                {BANDS.map((b, i) => (
                  <div key={b.id} className="flex flex-col items-center gap-2">
                    <span className="font-mono text-[12px] tabular-nums font-bold">{gains[i] > 0 ? '+' : ''}{gains[i]}</span>
                    <Slider.Root value={[gains[i]]} min={-12} max={12} step={1}
                      orientation="vertical"
                      onValueChange={([v]) => setBand(i, v)}
                      className="relative flex h-32 w-5 touch-none flex-col items-center">
                      <Slider.Track className="relative w-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute w-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                      <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                    </Slider.Root>
                    <span className="text-[10px] font-bold text-[var(--color-fg-muted)]">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="audio" colorVar="--color-cat-audio" busy={busy} progress={progress} label="Apply EQ" busyLabel="Processing…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
