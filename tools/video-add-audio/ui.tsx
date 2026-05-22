'use client';
import * as React from 'react';
import { Upload, Music, X } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpegMulti, downloadBlob } from '@/engines/ffmpeg';

type EndMode = 'shortest' | 'video';

export default function VideoAddAudioTool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [audio, setAudio] = React.useState<File | null>(null);
  const [endMode, setEndMode] = React.useState<EndMode>('shortest');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const audioRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item || !audio) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const vExt = item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4';
      const aExt = audio.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3';
      const blob = await runFfmpegMulti({
        inputs: [{ name: `v.${vExt}`, data: item.file }, { name: `a.${aExt}`, data: audio }],
        outputName: 'out.mp4',
        args: (names, o) => [
          '-i', names[0], '-i', names[1],
          '-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
          ...(endMode === 'shortest' ? ['-shortest'] : []),
          '-movflags', '+faststart', o,
        ],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-audio.mp4');
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
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Audio track</div>
                {audio ? (
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
                    <Music className="h-4 w-4 text-[var(--color-cat-audio)]" />
                    <span className="flex-1 truncate">{audio.name}</span>
                    <button type="button" onClick={() => setAudio(null)} className="text-[var(--color-fg-muted)] hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => audioRef.current?.click()}
                    className="mt-2 flex w-full items-center justify-center gap-2 border border-dashed border-black/[0.18] py-3 text-[12px] text-[var(--color-fg-muted)]">
                    <Upload className="h-4 w-4" /> Choose audio file
                  </button>
                )}
                <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setAudio(f); }} />
              </div>
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">End when</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['shortest', 'video'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setEndMode(m)}
                      className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${endMode === m ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {m === 'shortest' ? 'Shortest' : 'Video length'}
                    </button>
                  ))}
                </div>
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Add Audio" busyLabel="Muxing…" onClick={run} error={error} disabled={!audio} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
