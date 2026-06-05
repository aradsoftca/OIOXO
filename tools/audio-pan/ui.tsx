'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { pan, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';

export default function AudioPanTool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [panValue, setPanValue] = React.useState(0);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const label = panValue === 0 ? 'Center'
    : panValue < 0 ? `${Math.round(-panValue * 100)}% Left`
    : `${Math.round(panValue * 100)}% Right`;

  const preview = async () => {
    if (!item) return;
    setBusy(true); setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      const out = pan(item.buffer, panValue);
      setPreviewUrl(URL.createObjectURL(await encodeAudio(out, 'wav', 192)));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const out = pan(item.buffer, panValue);
      const blob = await encodeAudio(out, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-pan.${format}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {item.info.channels === 1 ? 'mono → stereo' : 'stereo'}</span>
            <button type="button" onClick={() => { setItem(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change file
            </button>
          </div>

          <Waveform buffer={item.buffer} player />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Pan</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{label}</span>
                </div>
                <Slider.Root value={[panValue]} min={-1} max={1} step={0.01}
                  onValueChange={([v]) => setPanValue(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                    <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                </Slider.Root>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--color-fg-muted)]">
                  <span>L</span><span>Center</span><span>R</span>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {[-1, -0.5, 0, 0.5, 1].map((v) => (
                    <button key={v} type="button" onClick={() => setPanValue(v)}
                      className="border border-black/[0.08] py-1.5 text-[10px] font-mono tabular-nums hover:border-[var(--color-cat-audio)]">
                      {v === 0 ? 'C' : v < 0 ? `L${-v * 100}` : `R${v * 100}`}
                    </button>
                  ))}
                </div>
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
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
