'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { encodeWav, encodeMp3, downloadBlob } from '@/engines/audio';
import { encodeAudio } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';
const BITRATES = [96, 128, 192, 256, 320];

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [format, setFormat] = React.useState<Format>('mp3');
  const [bitrate, setBitrate] = React.useState(192);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [resultSize, setResultSize] = React.useState<number | null>(null);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setResultSize(null);
    try {
      const blob = format === 'mp3'
        ? await encodeMp3(item.buffer, bitrate)
        : await encodeAudio(item.buffer, 'wav', 192);
      setResultSize(blob.size);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `.${format}`);
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
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {item.info.sampleRate} Hz · {(item.info.fileSize / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => { setItem(null); setResultSize(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Output format</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['mp3', 'wav'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-3 text-[12px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.toUpperCase()}
                      <div className="mt-1 text-[9px] font-normal tracking-normal opacity-75">
                        {f === 'mp3' ? 'Smaller files' : 'Lossless quality'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {format === 'mp3' && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Bitrate</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BITRATES.map((br) => (
                      <button key={br} type="button" onClick={() => setBitrate(br)}
                        className={`border py-2 text-[11px] font-mono tabular-nums transition ${bitrate === br ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                        {br}k
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] text-[var(--color-fg-muted)]">
                    128k = web standard · 192k = good quality · 320k = max
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
                <div className="mt-1 text-[14px] font-semibold break-all">{item.file.name.replace(/\.[^.]+$/, '')}.{format}</div>
                {resultSize !== null && (
                  <div className="mt-2 font-mono text-[12px] text-[var(--color-fg-muted)]">
                    {(resultSize / 1024).toFixed(0)} KB
                    {' '}({Math.round((resultSize / item.info.fileSize) * 100)}% of original)
                  </div>
                )}
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Converting…' : 'Convert & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
