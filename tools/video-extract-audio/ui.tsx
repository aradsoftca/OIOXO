'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { recordRange, downloadBlob, fmtDuration } from '@/engines/video';

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await recordRange(item.video, 0, item.info.duration, {
        withVideo: false,
        withAudio: true,
        mimeType: 'audio/webm;codecs=opus',
        onProgress: (t) => setProgress(Math.round((t / item.info.duration) * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-audio.webm');
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
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6">
              <div className="text-[12px] text-[var(--color-fg-muted)]">
                Pulls the audio track into an Opus-encoded WebM container. To get MP3, run the output through Audio → Convert Format.
                {!item.info.hasAudio && (
                  <div className="mt-2 text-amber-600">This file has no audio track to extract.</div>
                )}
              </div>
              <div className="mt-4 text-[11px] text-[var(--color-fg-muted)]">
                Processing runs at playback speed — a 60-second clip takes ~60 seconds.
              </div>
            </div>
            <aside>
              <button type="button" onClick={run} disabled={busy || !item.info.hasAudio}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Extracting… ${progress}%` : 'Extract & Download'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
