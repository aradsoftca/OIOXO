'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { Waveform } from '@/components/tool/Waveform';
import { reverse, encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [format, setFormat] = React.useState<Format>('wav');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const out = reverse(item.buffer);
      const blob = await encodeAudio(out, format, 192);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-reversed.${format}`);
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
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[12px] text-[var(--color-fg-muted)]">
                Your audio will play exactly the same — but from end to start. Try it on a vocal sample for the classic reversed-tape effect.
              </div>
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
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
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Saving…' : 'Reverse & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
