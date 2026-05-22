'use client';
import * as React from 'react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function Tool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3'),
        outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mp3',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-stereo.mp3');
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
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s · {item.info.channels} ch</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Source</div>
              <div className="mt-1 font-mono text-[16px] tabular-nums font-bold">{item.info.channels === 1 ? 'Mono' : `${item.info.channels} channels`}</div>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
              <div className="mt-1 font-mono text-[16px] tabular-nums font-bold">Stereo (2 ch)</div>
              <div className="mt-3 text-[11px] text-[var(--color-fg-muted)]">
                The single channel is duplicated into left and right — same audio, both speakers.
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="audio" colorVar="--color-cat-audio" busy={busy} progress={progress} label="Convert & Download" busyLabel="Converting…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
