'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function VideoVolumeTool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [db, setDb] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const args = ['-i', '__in__', '-c:v', 'copy', '-af', `volume=${db}dB`, '-c:a', 'aac', '-movflags', '+faststart', '__out__'];
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => args.map((a) => a === '__in__' ? i : a === '__out__' ? o : a),
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-volume.mp4');
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
          {!item.info.hasAudio && <div className="border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">This clip has no audio track to adjust.</div>}
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <video src={item.url} controls className="w-full" />
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Gain</span>
                  <span className="font-mono text-[16px] tabular-nums font-bold">{db > 0 ? '+' : ''}{db} dB</span>
                </div>
                <Slider.Root value={[db]} min={-30} max={30} step={1} onValueChange={([v]) => setDb(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[-12, -6, 0, 6].map((v) => (
                    <button key={v} type="button" onClick={() => setDb(v)} className="border border-black/[0.08] py-1.5 text-[10px] font-mono tabular-nums hover:border-[var(--color-cat-video)]">{v > 0 ? '+' : ''}{v}</button>
                  ))}
                </div>
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Apply Volume" busyLabel="Processing…" onClick={run} error={error} disabled={!item.info.hasAudio || db === 0} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
