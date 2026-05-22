'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

interface Flip { id: string; label: string; filter: string; }
const FLIPS: Flip[] = [
  { id: 'h',    label: 'Horizontal ⇄',  filter: 'hflip' },
  { id: 'v',    label: 'Vertical ⇅',    filter: 'vflip' },
  { id: 'both', label: 'Both ⤢',        filter: 'hflip,vflip' },
];

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [flip, setFlip] = React.useState(FLIPS[0]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-vf', flip.filter, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-flip${flip.id}.mp4`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height} · {fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Flip direction</div>
              <div className="grid grid-cols-3 gap-1.5">
                {FLIPS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFlip(f)}
                    className={`border py-4 text-[12px] font-bold transition ${flip.id === f.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Flip & Download" busyLabel="Flipping…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
