'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-compress';

const LEVELS = [
  { id: 'visually-lossless', label: 'Visually Lossless', crf: 18, preset: 'medium', sub: 'Tiny difference from source' },
  { id: 'high',              label: 'High Quality',      crf: 22, preset: 'medium', sub: 'Great for archive' },
  { id: 'web',               label: 'Web Standard',      crf: 26, preset: 'fast',   sub: 'Streams great' },
  { id: 'small',             label: 'Small File',        crf: 30, preset: 'fast',   sub: 'Tight target size' },
];

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [level, setLevel] = React.useState(LEVELS[2]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [resultSize, setResultSize] = React.useState<number | null>(null);

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', item.file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    setBusy(true); setError(''); setProgress(0); setResultSize(null);
    try {
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-c:v', 'libx264', '-preset', level.preset, '-crf', String(level.crf), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      setResultSize(blob.size);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-compressed.mp4');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const savings = item && resultSize ? Math.max(0, Math.round((1 - resultSize / item.info.fileSize) * 100)) : null;

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <VideoDrop loaded={false} onLoad={setItem} ffmpegOnly />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)} · {(item.info.fileSize / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" onClick={() => { setItem(null); setResultSize(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Quality level</div>
              <div className="space-y-1.5">
                {LEVELS.map((l) => (
                  <button key={l.id} type="button" onClick={() => setLevel(l)}
                    className={`flex w-full items-center justify-between border px-3 py-3 text-left transition ${level.id === l.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg)]'}`}>
                    <div>
                      <div className="text-[13px] font-bold">{l.label}</div>
                      <div className={`text-[10px] ${level.id === l.id ? 'text-white/80' : 'text-[var(--color-fg-muted)]'}`}>{l.sub}</div>
                    </div>
                    <div className="font-mono text-[10px] tabular-nums opacity-70">CRF {l.crf}</div>
                  </button>
                ))}
              </div>
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</div>
                <div className="mt-1 font-mono text-[12px] text-[var(--color-fg-muted)]">Original: {(item.info.fileSize / 1024 / 1024).toFixed(1)} MB</div>
                {resultSize !== null && (
                  <>
                    <div className="font-mono text-[12px] text-[var(--color-fg-muted)]">New: {(resultSize / 1024 / 1024).toFixed(1)} MB</div>
                    {savings !== null && (
                      <div className="mt-1 font-mono text-[20px] font-bold tabular-nums text-[var(--color-cat-video)]">{savings}% smaller</div>
                    )}
                  </>
                )}
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Compress & Download" busyLabel="Compressing…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
