'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { trim, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Mode = 'duration' | 'count';
type Format = 'wav' | 'mp3';

export default function AudioSplitTool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [mode, setMode] = React.useState<Mode>('duration');
  const [chunkSec, setChunkSec] = React.useState(60);
  const [count, setCount] = React.useState(4);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const duration = item?.info.duration ?? 0;

  const segments = React.useMemo(() => {
    if (!item) return [] as { start: number; end: number }[];
    if (mode === 'duration') {
      const out: { start: number; end: number }[] = [];
      let t = 0;
      while (t < duration) {
        const end = Math.min(duration, t + chunkSec);
        out.push({ start: t, end });
        t = end;
      }
      return out;
    }
    const piece = duration / Math.max(1, count);
    return Array.from({ length: count }, (_, i) => ({
      start: i * piece,
      end: Math.min(duration, (i + 1) * piece),
    }));
  }, [item, mode, chunkSec, count, duration]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const base = item.file.name.replace(/\.[^.]+$/, '');
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const clip = trim(item.buffer, seg.start, seg.end);
        const blob = await encodeAudio(clip, format, 192);
        const buf = await blob.arrayBuffer();
        zip.file(`${base}-part-${String(i + 1).padStart(3, '0')}.${format}`, buf);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${base}-split.zip`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{duration.toFixed(2)}s · {segments.length} pieces</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change file
            </button>
          </div>

          <div className="relative">
            <Waveform buffer={item.buffer} />
            <div className="pointer-events-none absolute inset-0">
              {segments.slice(0, -1).map((s, i) => (
                <div key={i} className="absolute top-0 bottom-0 w-px bg-[var(--color-cat-audio)]"
                  style={{ left: `${(s.end / duration) * 100}%` }} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Split by</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['duration', 'count'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {m === 'duration' ? 'Piece length' : 'Piece count'}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'duration' && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Each piece</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">{chunkSec.toFixed(0)}s</span>
                  </div>
                  <Slider.Root value={[chunkSec]} min={5} max={Math.max(10, Math.ceil(duration))} step={1}
                    onValueChange={([v]) => setChunkSec(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                      <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                    </Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                  </Slider.Root>
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {[10, 30, 60, 120, 300].map((v) => (
                      <button key={v} type="button" onClick={() => setChunkSec(v)}
                        className="border border-black/[0.08] py-1.5 text-[10px] font-mono tabular-nums hover:border-[var(--color-cat-audio)]">
                        {v}s
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'count' && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Pieces</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">{count}</span>
                  </div>
                  <Slider.Root value={[count]} min={2} max={50} step={1}
                    onValueChange={([v]) => setCount(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                      <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                    </Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                  </Slider.Root>
                  <div className="mt-2 text-[10px] text-[var(--color-fg-muted)]">≈ {(duration / count).toFixed(1)}s per piece</div>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['wav', 'mp3'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" onClick={run} disabled={busy || !segments.length}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Split & Download ZIP
              </button>

              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
