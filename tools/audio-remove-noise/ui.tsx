'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2, Wand2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';
import { denoise, type DenoiseProgress } from '@/engines/audio/denoise';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'audio-remove-noise';

type Format = 'wav' | 'mp3';

export default function AudioRemoveNoiseTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [strength, setStrength] = React.useState(1);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<DenoiseProgress | null>(null);
  const [error, setError] = React.useState('');
  const [resultBuffer, setResultBuffer] = React.useState<AudioBuffer | null>(null);
  const [resultUrl, setResultUrl] = React.useState<string>('');

  // Revoke the prior preview URL on replace AND on unmount. Without this the
  // final denoised-audio URL leaked on navigation away.
  React.useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const run = async () => {
    if (!item) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', item.file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    setBusy(true); setError(''); setProgress({ phase: 'Preparing', ratio: 0 });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultBuffer(null);
    setResultUrl('');
    try {
      const out = await denoise(item.buffer, { strength, onProgress: (p) => setProgress(p) });
      setResultBuffer(out);
      const preview = await encodeAudio(out, 'wav', 192);
      setResultUrl(URL.createObjectURL(preview));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const download = async () => {
    if (!resultBuffer || !item) return;
    setBusy(true);
    try {
      const blob = await encodeAudio(resultBuffer, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-clean.${format}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
              {item.info.duration.toFixed(2)}s · {item.info.sampleRate} Hz · {item.info.channels === 1 ? 'mono' : 'stereo'}
            </span>
            <button type="button" onClick={() => { setItem(null); setResultBuffer(null); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultUrl(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change file
            </button>
          </div>

          <Waveform buffer={resultBuffer ?? item.buffer} />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Noise reduction</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{Math.round(strength * 100)}%</span>
                </div>
                <Slider.Root value={[strength]} min={0} max={1} step={0.05}
                  onValueChange={([v]) => setStrength(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                    <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">
                  100% removes the most noise. Lower values keep more of the original character.
                </div>
              </div>

              {resultUrl && (
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Preview</div>
                  <audio src={resultUrl} controls className="w-full" />
                </div>
              )}

              {busy && progress && (
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg)]">
                    <Wand2 className="h-3 w-3 animate-pulse" />
                    <span className="font-medium">{progress.phase}…</span>
                    <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{Math.round(progress.ratio * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden bg-black/[0.06]">
                    <div className="h-full bg-[var(--color-cat-audio)] transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output format</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
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
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {busy ? 'Cleaning…' : resultBuffer ? 'Re-clean' : 'Remove noise'}
              </button>

              {resultBuffer && (
                <button type="button" onClick={download} disabled={busy}
                  className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download .{format}
                </button>
              )}

              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
