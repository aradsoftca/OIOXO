'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { downloadBlob, fmtDuration } from '@/engines/video';
import { runFfmpeg, extOf, videoMimeForExt } from '@/engines/ffmpeg';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-mute';

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', item.file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    setBusy(true); setError(''); setProgress(0);
    try {
      // ffmpeg stream copy: drop the audio, keep the video bytes and the input's
      // container. Was MediaRecorder + captureStream -> WebM, which never produced
      // a file on Safari/iOS (no captureStream, no WebM recording) and ran at
      // playback speed everywhere. The free-tier brand mark is added by the
      // ffmpeg engine's watermark pass (setFfmpegWatermark), like other video tools.
      const ext = extOf(item.file.name) || 'mp4';
      const blob = await runFfmpeg({
        input: item.file, inputName: `in.${ext}`, outputName: `out.${ext}`,
        args: (i, o) => ['-i', i, '-map', '0:v?', '-an', '-c:v', 'copy', o],
        mimeType: videoMimeForExt(ext),
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-muted.${ext}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <VideoDrop loaded={false} onLoad={setItem} ffmpegOnly />}

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
                Drops the audio track and keeps the video as-is, in the same format as your file ({(extOf(item.file.name) || 'mp4').toUpperCase()}).
                {!item.info.hasAudio && (
                  <div className="mt-2 text-amber-600">This file already has no audio.</div>
                )}
              </div>
              <div className="mt-4 text-[11px] text-[var(--color-fg-muted)]">
                Runs in your browser; the first run downloads the video engine once.
              </div>
            </div>
            <aside>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Muting… ${progress}%` : 'Mute & Download'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
