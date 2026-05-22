'use client';

import * as React from 'react';
import { Upload, Download, Loader2, Crop, FileVideo } from 'lucide-react';
import { cn } from '@/lib/cn';
import { runFfmpeg } from '@/engines/ffmpeg';

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: '9:16', label: '9:16 · Reels/Shorts', w: 1080, h: 1920 },
  { id: '4:5',  label: '4:5 · Feed',          w: 1080, h: 1350 },
  { id: '1:1',  label: '1:1 · Square',        w: 1080, h: 1080 },
  { id: '16:9', label: '16:9 · Landscape',    w: 1920, h: 1080 },
];

const FOCUS: { id: string; label: string; v: number }[] = [
  { id: 'left', label: 'Left', v: 0 },
  { id: 'center', label: 'Center', v: 0.5 },
  { id: 'right', label: 'Right', v: 1 },
];

export default function ReframeTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [srcUrl, setSrcUrl] = React.useState('');
  const [ratio, setRatio] = React.useState(RATIOS[0]);
  const [focus, setFocus] = React.useState(0.5);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [outUrl, setOutUrl] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); if (outUrl) URL.revokeObjectURL(outUrl); }, [srcUrl, outUrl]);

  const load = (f: File) => {
    if (!f.type.startsWith('video/')) return;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    setFile(f); setSrcUrl(URL.createObjectURL(f)); setOutUrl('');
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setProgress(0); setOutUrl('');
    try {
      const { w, h } = ratio;
      // Scale to COVER the target, then crop to exact size with chosen H focus.
      const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:(in_w-out_w)*${focus}:(in_h-out_h)/2`;
      const blob = await runFfmpeg({
        input: file,
        inputName: 'in.mp4',
        outputName: 'out.mp4',
        mimeType: 'video/mp4',
        args: (i, o) => ['-i', i, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', o],
        onProgress: setProgress,
      });
      if (outUrl) URL.revokeObjectURL(outUrl);
      setOutUrl(URL.createObjectURL(blob));
    } catch (e) { console.error('reframe failed', e); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!outUrl || !file) return;
    const a = document.createElement('a');
    a.href = outUrl; a.download = `${file.name.replace(/\.[^.]+$/, '')}-${ratio.id.replace(':', 'x')}.mp4`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {!file ? (
          <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) load(f); }} onDragOver={(e) => e.preventDefault()}
            className="flex aspect-video items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a video</div>
                <div className="mt-1 text-[13px] text-white/55">MP4 · WebM · MOV — reframed in your browser, files stay yours</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Original</div>
              <video src={srcUrl} controls className="w-full border border-black/[0.08] bg-black" />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Reframed</div>
              {outUrl ? <video src={outUrl} controls className="mx-auto border border-black/[0.08] bg-black" style={{ aspectRatio: ratio.id.replace(':', '/'), maxHeight: 360 }} />
                : <div className="grid place-items-center border border-dashed border-black/[0.12] bg-[var(--color-surface-1)] text-[12px] text-[var(--color-fg-subtle)]" style={{ aspectRatio: ratio.id.replace(':', '/'), maxHeight: 360, margin: '0 auto' }}>{busy ? `Rendering ${Math.round(progress * 100)}%` : 'Press Reframe'}</div>}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Aspect ratio</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {RATIOS.map((r) => (
              <button key={r.id} type="button" onClick={() => setRatio(r)}
                className={cn('border px-2 py-2 text-[11px] font-bold transition', ratio.id === r.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}>
                {r.id}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{ratio.label}</div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Keep in frame</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {FOCUS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFocus(f.v)}
                className={cn('border px-2 py-2 text-[11px] font-bold transition', focus === f.v ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {file && !outUrl && (
          <button type="button" onClick={run} disabled={busy}
            className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition', busy ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-video)] text-white shadow-lg hover:brightness-110')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />} {busy ? `Rendering ${Math.round(progress * 100)}%` : 'Reframe'}
          </button>
        )}

        {outUrl && (
          <>
            <button type="button" onClick={download} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Download className="h-4 w-4" /> Download MP4</button>
            <button type="button" onClick={() => setOutUrl('')} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]">Change settings</button>
          </>
        )}

        {file && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <FileVideo className="h-4 w-4" /> New video
          </button>
        )}
      </aside>
    </div>
  );
}
