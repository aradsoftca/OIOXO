'use client';
import * as React from 'react';
import { Loader2, Download, Repeat } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { runFfmpeg, extOf } from '@/engines/ffmpeg';

export default function Boomerang() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; name: string } | null>(null);
  const { guard, gate } = useUsageGate('video');

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const run = async () => {
    if (!item) return;
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy(true); setError(''); setOut(null); setRatio(0);
    try {
      const inExt = extOf(item.file.name) || 'mp4';
      const blob = await runFfmpeg({
        input: item.file, inputName: `in.${inExt}`, outputName: 'out.mp4',
        args: (i, o) => ['-i', i, '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]',
          '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o],
        mimeType: 'video/mp4', onProgress: setRatio,
      });
      setOut({ url: URL.createObjectURL(blob), name: `${item.file.name.replace(/\.[^.]+$/, '')}-boomerang.mp4` });
    } catch (e) { setError((e as Error).message || 'Could not create the boomerang.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {gate}
      {!item ? <VideoDrop onLoad={setItem} loaded={false} /> : (
        <div className="flex items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <span className="text-[12px] font-semibold">{item.file.name}</span>
          <button type="button" onClick={() => { setItem(null); setOut(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
        </div>
      )}
      {item && (
        <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />} {busy ? `Working… ${Math.round(ratio * 100)}%` : 'Make boomerang'}
        </button>
      )}
      {item && <p className="text-[11px] text-[var(--color-fg-subtle)]">Tip: use a short clip (1–4s) for the classic boomerang effect.</p>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-video)]/40 bg-[var(--color-cat-video)]/5 p-4">
          <video src={out.url} controls autoPlay loop muted className="max-h-80 w-full bg-black" />
          <a href={out.url} download={out.name} className="flex w-fit items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</a>
        </div>
      )}
    </div>
  );
}
