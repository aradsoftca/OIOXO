'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';

export default function GifToVideoTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = (f: File) => {
    if (!/gif/i.test(f.type) && !/\.gif$/i.test(f.name)) { setError('Please choose a GIF file.'); return; }
    setError('');
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(f));
    setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      // Even dimensions required by yuv420p; faststart for web playback.
      const args = ['-i', '__in__', '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '__out__'];
      const blob = await runFfmpeg({
        input: file, inputName: 'in.gif', outputName: 'out.mp4',
        args: (i, o) => args.map((a) => a === '__in__' ? i : a === '__out__' ? o : a),
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, file.name.replace(/\.[^.]+$/, '') + '.mp4');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) load(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
        >
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" /> Drop a GIF or click to browse
          </button>
          <input ref={inputRef} type="file" accept="image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
        </div>
      ) : (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => { setFile(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-black/5 p-4 grid place-items-center">
              <img src={url} alt="" className="max-h-[360px] max-w-full object-contain" />
            </div>
            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
                MP4 is typically a fraction of the GIF&apos;s size and plays back smoothly on every device.
              </div>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Convert to MP4" busyLabel="Converting…" onClick={run} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
