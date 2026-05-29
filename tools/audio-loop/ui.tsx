'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2, Repeat } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { trim, concat, fadeIn, fadeOut, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Mode = 'count' | 'duration';
type Format = 'wav' | 'mp3';

export default function AudioLoopTool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [mode, setMode] = React.useState<Mode>('count');
  const [count, setCount] = React.useState(3);
  const [targetSec, setTargetSec] = React.useState(60);
  const [crossfade, setCrossfade] = React.useState(0);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState('');

  // Mirror previewUrl into a ref so the cleanup only fires on unmount —
  // running it on every URL change worked here only because `preview()`
  // already revokes inline, but the shape invites a future regression where
  // the cleanup races with state updates and revokes the live URL.
  const previewUrlRef = React.useRef('');
  React.useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);
  React.useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const sourceDur = item?.info.duration ?? 0;
  // Cap repetitions so a very short source paired with the slider's 1-hour
  // max can't OOM the tab. 4000 reps of a 1s clip is already 1+ hour of
  // 16-bit stereo audio (~360 MB rendered) — well past anything useful.
  const repetitions = Math.min(
    4000,
    mode === 'count' ? count : Math.max(1, Math.ceil(targetSec / Math.max(0.01, sourceDur))),
  );
  const finalDur = mode === 'count' ? sourceDur * count : Math.min(targetSec, sourceDur * repetitions);

  const buildLoop = (): AudioBuffer | null => {
    if (!item) return null;
    let loops: AudioBuffer[] = [];
    if (crossfade > 0 && sourceDur > crossfade * 2) {
      // Apply a fade-in to the start and fade-out to the end of each segment
      // so the joins blend instead of clicking. We do not actually overlap
      // segments (concat is sequential), but the equal-power-shaped fades on
      // both ends make a smooth ring at the boundary.
      const shaped = fadeIn(fadeOut(item.buffer, crossfade), crossfade);
      loops = Array.from({ length: repetitions }, () => shaped);
    } else {
      loops = Array.from({ length: repetitions }, () => item.buffer);
    }
    let combined = concat(loops);
    if (mode === 'duration' && combined.duration > targetSec) {
      combined = trim(combined, 0, targetSec);
    }
    return combined;
  };

  const preview = async () => {
    if (!item) return;
    setBusy(true); setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      const out = buildLoop();
      if (!out) return;
      const blob = await encodeAudio(out, 'wav', 192);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const out = buildLoop();
      if (!out) return;
      const blob = await encodeAudio(out, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-loop.${format}`);
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
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{sourceDur.toFixed(2)}s source · ×{repetitions} → {finalDur.toFixed(1)}s</span>
            <button type="button" onClick={() => { setItem(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change file
            </button>
          </div>

          <Waveform buffer={item.buffer} />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Loop by</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['count', 'duration'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {m === 'count' ? 'Repeat N times' : 'Fit duration'}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'count' ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Repeats</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">×{count}</span>
                  </div>
                  <Slider.Root value={[count]} min={2} max={50} step={1}
                    onValueChange={([v]) => setCount(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                      <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                    </Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                  </Slider.Root>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Target duration</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">{targetSec.toFixed(0)}s</span>
                  </div>
                  <Slider.Root value={[targetSec]} min={5} max={3600} step={5}
                    onValueChange={([v]) => setTargetSec(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                      <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                    </Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                  </Slider.Root>
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {[30, 60, 300, 900, 1800].map((v) => (
                      <button key={v} type="button" onClick={() => setTargetSec(v)}
                        className="border border-black/[0.08] py-1.5 text-[10px] font-mono tabular-nums hover:border-[var(--color-cat-audio)]">
                        {v >= 60 ? `${v / 60}m` : `${v}s`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Edge smoothing</span>
                  <span className="font-mono text-[12px] tabular-nums">{crossfade.toFixed(2)}s</span>
                </div>
                <Slider.Root value={[crossfade]} min={0} max={Math.min(1, sourceDur / 4)} step={0.02}
                  onValueChange={([v]) => setCrossfade(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                    <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Adds a short fade to both ends so loop seams don&apos;t click.</div>
              </div>

              {previewUrl && (
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Preview</div>
                  <audio src={previewUrl} controls className="w-full" />
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

              <button type="button" onClick={preview} disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />}
                Preview
              </button>

              <button type="button" onClick={download} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download .{format}
              </button>

              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
