'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function VideoReverseTool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [keepAudio, setKeepAudio] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const audio = item.info.hasAudio && keepAudio;
      const args = audio
        ? ['-i', '__in__', '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', '__out__']
        : ['-i', '__in__', '-an', '-vf', 'reverse', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', '__out__'];
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => args.map((a) => a === '__in__' ? i : a === '__out__' ? o : a),
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-reversed.mp4');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}
      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <video src={item.url} controls className="w-full" />
            </div>
            <aside className="space-y-3">
              {item.info.hasAudio && (
                <label className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg)]">
                  <span className="font-medium">Reverse audio too</span>
                  <input type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} className="h-4 w-4" />
                </label>
              )}
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Reverse" busyLabel="Reversing…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
