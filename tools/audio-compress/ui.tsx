'use client';
import * as React from 'react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

interface Bitrate { kbps: number; label: string; note: string; }
const BITRATES: Bitrate[] = [
  { kbps: 320, label: '320 kbps', note: 'Near-lossless' },
  { kbps: 256, label: '256 kbps', note: 'High quality' },
  { kbps: 192, label: '192 kbps', note: 'Standard' },
  { kbps: 128, label: '128 kbps', note: 'Web' },
  { kbps: 96,  label: '96 kbps',  note: 'Smaller' },
  { kbps: 64,  label: '64 kbps',  note: 'Smallest' },
];

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [br, setBr] = React.useState(BITRATES[3]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  const estSize = item ? (item.info.duration * br.kbps * 1000 / 8) : 0;

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3'),
        outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-c:a', 'libmp3lame', '-b:a', `${br.kbps}k`, o],
        mimeType: 'audio/mp3',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-${br.kbps}k.mp3`);
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
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Target bitrate</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {BITRATES.map((b) => (
                  <button key={b.kbps} type="button" onClick={() => setBr(b)}
                    className={`border p-3 text-left transition ${br.kbps === b.kbps ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08]'}`}>
                    <div className="text-[12px] font-bold">{b.label}</div>
                    <div className="text-[10px] opacity-80">{b.note}</div>
                  </button>
                ))}
              </div>
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Estimated size</div>
                <div className="mt-1 font-mono text-[18px] tabular-nums font-bold">{(estSize / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <FfmpegRunButton gateCategory="audio" colorVar="--color-cat-audio" busy={busy} progress={progress} label="Compress & Download" busyLabel="Compressing…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
