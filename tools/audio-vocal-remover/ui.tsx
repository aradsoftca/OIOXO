'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { removeVocals, isolateVocals, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { enforcePolicy } from '@/lib/limits/server-check';

const POLICY_KEY = 'audio-vocal-remover';

type Mode = 'instrumental' | 'acapella';
type Format = 'wav' | 'mp3';

export default function AudioVocalRemoverTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [mode, setMode] = React.useState<Mode>('instrumental');
  const [amount, setAmount] = React.useState(1);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const isMono = item?.info.channels === 1;

  const build = () => {
    if (!item) return null;
    return mode === 'instrumental' ? removeVocals(item.buffer, amount) : isolateVocals(item.buffer, amount);
  };

  const preview = async () => {
    if (!item) return;
    setBusy(true); setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      const out = build(); if (!out) return;
      setPreviewUrl(URL.createObjectURL(await encodeAudio(out, 'wav', 192)));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!item) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-size', value: item.file.size },
      { type: 'lever', lever: 'input-duration', value: item.info.duration },
    ]);
    if (!ok) return;
    setBusy(true); setError('');
    try {
      const out = build(); if (!out) return;
      const blob = await encodeAudio(out, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-${mode}.${format}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {isMono ? 'mono' : 'stereo'}</span>
            <button type="button" onClick={() => { setItem(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          {isMono && (
            <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This works by separating the stereo channels, so it needs a stereo track. Mono files have nothing to cancel.
            </div>
          )}

          <Waveform buffer={item.buffer} />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['instrumental', 'acapella'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {m === 'instrumental' ? 'Remove vocals' : 'Isolate vocals'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Strength</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{Math.round(amount * 100)}%</span>
                </div>
                <Slider.Root value={[amount]} min={0} max={1} step={0.05} disabled={isMono}
                  onValueChange={([v]) => setAmount(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Best on songs with the lead voice mixed front-and-center. Heavily processed tracks vary.</div>
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
              <button type="button" onClick={preview} disabled={busy || isMono}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Preview
              </button>
              <button type="button" onClick={download} disabled={busy || isMono}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download .{format}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
