'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

const PRESET_WIDTHS = [1920, 1280, 854, 640, 480, 360];

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [width, setWidth] = React.useState(1280);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => { if (item) setWidth(Math.min(1280, item.info.width)); }, [item]);
  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const newH = item ? Math.round((width * item.info.height) / item.info.width / 2) * 2 : 0;

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const w = Math.round(width / 2) * 2; // ensure even for libx264
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-vf', `scale=${w}:-2`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-${w}w.mp4`);
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
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Common widths</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRESET_WIDTHS.map((w) => (
                    <button key={w} type="button" onClick={() => setWidth(w)}
                      className={`border py-2 text-[11px] font-mono tabular-nums transition ${width === w ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {w}p
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Custom width</div>
                <input type="number" value={width} min={64} max={7680} onChange={(e) => setWidth(Number(e.target.value))}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-video)]" />
              </label>
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">New size</div>
                <div className="mt-1 font-mono text-[18px] tabular-nums font-bold">{width}×{newH}</div>
                <div className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                  {((width / item.info.width) * 100).toFixed(0)}% of original
                </div>
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Resize & Download" busyLabel="Resizing…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
