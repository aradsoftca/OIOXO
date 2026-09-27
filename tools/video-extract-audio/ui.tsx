'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { downloadBlob, fmtDuration } from '@/engines/video';
import { runFfmpeg } from '@/engines/ffmpeg';

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
      // ffmpeg decodes the file directly: real MP3 (what /mp4-to-mp3 visitors
      // want), and seconds instead of the old real-time playback recording.
      const ext = (item.file.name.match(/\.([^.]+)$/)?.[1] || 'mp4').toLowerCase();
      const blob = await runFfmpeg({
        input: item.file, inputName: `in.${ext}`, outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mpeg',
        onProgress: (r) => setProgress(Math.round(r * 100)),
      });
      if (!blob.size) throw new Error('This video has no audio track to extract.');
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-audio.mp3');
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(/does not contain any stream|Output file #0 does not contain|no audio/i.test(msg)
        ? 'This video has no audio track to extract.' : msg);
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
                Extracts the audio track as a 192 kbps MP3.
                {!item.info.hasAudio && (
                  <div className="mt-2 text-amber-600">This file has no audio track to extract.</div>
                )}
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
