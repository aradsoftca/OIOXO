'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

interface AspectPreset { id: string; label: string; w: number; h: number; }
const PRESETS: AspectPreset[] = [
  { id: 'square',  label: '1:1 Square',      w: 1, h: 1 },
  { id: 'portrait', label: '9:16 Portrait',  w: 9, h: 16 },
  { id: 'story',   label: '4:5 Story',       w: 4, h: 5 },
  { id: 'wide',    label: '16:9 Wide',       w: 16, h: 9 },
  { id: 'cinema',  label: '21:9 Cinema',     w: 21, h: 9 },
  { id: 'classic', label: '4:3 Classic',     w: 4, h: 3 },
];

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [preset, setPreset] = React.useState(PRESETS[0]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const dims = React.useMemo(() => {
    if (!item) return null;
    const sw = item.info.width, sh = item.info.height;
    const targetAR = preset.w / preset.h;
    const sourceAR = sw / sh;
    let cw: number, ch: number;
    if (sourceAR > targetAR) {
      ch = sh; cw = Math.round(sh * targetAR);
    } else {
      cw = sw; ch = Math.round(sw / targetAR);
    }
    cw = Math.floor(cw / 2) * 2;
    ch = Math.floor(ch / 2) * 2;
    return { cw, ch };
  }, [item, preset]);

  const run = async () => {
    if (!item || !dims) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const { cw, ch } = dims;
      const blob = await runFfmpeg({
        input: item.file,
        inputName: 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'),
        outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-vf', `crop=${cw}:${ch}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-crop-${preset.id}.mp4`);
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
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Aspect ratio</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPreset(p)}
                    className={`border py-3 text-[12px] font-bold transition ${preset.id === p.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">New size</div>
                <div className="mt-1 font-mono text-[18px] tabular-nums font-bold">{dims ? `${dims.cw}×${dims.ch}` : '—'}</div>
                <div className="font-mono text-[10px] text-[var(--color-fg-muted)]">Center-cropped from source</div>
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Crop & Download" busyLabel="Cropping…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
