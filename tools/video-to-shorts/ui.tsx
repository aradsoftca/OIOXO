'use client';
import * as React from 'react';
import { Loader2, Download, Smartphone } from 'lucide-react';
import { cn } from '@/lib/cn';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { runFfmpeg, extOf } from '@/engines/ffmpeg';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-to-shorts';

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: '9:16', label: '9:16 vertical', w: 1080, h: 1920 },
  { id: '4:5', label: '4:5 portrait', w: 1080, h: 1350 },
  { id: '1:1', label: '1:1 square', w: 1080, h: 1080 },
];
type Align = 'center' | 'left' | 'right';

export default function ShortsMaker() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [ratio, setRatio] = React.useState(RATIOS[0]);
  const [align, setAlign] = React.useState<Align>('center');
  const [autoHl, setAutoHl] = React.useState(false);   // auto-pick the highlight window
  const [clipLen, setClipLen] = React.useState(30);     // target short length (s)
  const [busy, setBusy] = React.useState(false);
  const [prog, setProg] = React.useState(0);
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; name: string } | null>(null);
  const { guard, gate } = useUsageGate('video');

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const run = async () => {
    if (!item) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-duration', value: item.info.duration },
    ]);
    if (!ok) return;
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy(true); setError(''); setOut(null); setProg(0);
    try {
      const { w, h } = ratio;
      // Auto-highlight: find the highest audio-energy window of the chosen length
      // and trim to it (on-device, no model). Falls back to the full clip if it
      // can't analyze. NEEDS BROWSER QA on real clips.
      let trim: { ss: number; t: number } | null = null;
      if (autoHl && item.info.duration > clipLen + 1) {
        setBusy(true);
        try {
          const { findHighlight } = await import('@/lib/studios/highlight');
          const hl = await findHighlight(item.file, clipLen);
          if (hl) trim = { ss: hl.start, t: hl.length };
        } catch { /* full clip */ }
      }
      // Scale up to fill the target frame, then crop. x offset chooses the focal side.
      const x = align === 'center' ? '(iw-ow)/2' : align === 'left' ? '0' : 'iw-ow';
      const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:${x}:(ih-oh)/2,setsar=1`;
      const inExt = extOf(item.file.name) || 'mp4';
      const blob = await runFfmpeg({
        input: item.file, inputName: `in.${inExt}`, outputName: 'out.mp4',
        args: (i, o) => [
          ...(trim ? ['-ss', String(trim.ss.toFixed(2)), '-t', String(trim.t.toFixed(2))] : []),
          '-i', i, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', o,
        ],
        mimeType: 'video/mp4', onProgress: setProg,
      });
      setOut({ url: URL.createObjectURL(blob), name: `${item.file.name.replace(/\.[^.]+$/, '')}-${ratio.id.replace(':', 'x')}.mp4` });
    } catch (e) { setError((e as Error).message || 'Could not reframe this video.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {gate}
      {policyGate.element}
      {!item ? <VideoDrop onLoad={setItem} loaded={false} /> : (
        <div className="flex items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <span className="text-[12px] font-semibold">{item.file.name}</span>
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height}</span>
          <button type="button" onClick={() => { setItem(null); setOut(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
        </div>
      )}
      {item && (
        <>
          <div className="flex flex-wrap gap-2">
            {RATIOS.map((r) => <button key={r.id} type="button" onClick={() => setRatio(r)} className={cn('border px-3 py-2 text-[12px] font-semibold', ratio.id === r.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)]/10' : 'border-black/[0.12]')}>{r.label}</button>)}
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-[var(--color-fg-muted)]">Focus</span>
            {(['left', 'center', 'right'] as const).map((a) => <button key={a} type="button" onClick={() => setAlign(a)} className={cn('border px-3 py-1.5 capitalize', align === a ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)]/10' : 'border-black/[0.12]')}>{a}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={autoHl} onChange={(e) => setAutoHl(e.target.checked)} />
              <span>Auto-highlight (pick the best moment by audio energy)</span>
            </label>
            {autoHl && (
              <select value={clipLen} onChange={(e) => setClipLen(Number(e.target.value))} className="border border-black/[0.12] bg-transparent px-2 py-1">
                {[15, 30, 45, 60].map(n => <option key={n} value={n}>{n}s</option>)}
              </select>
            )}
          </div>
          <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />} {busy ? `Reframing… ${Math.round(prog * 100)}%` : `Make ${ratio.label}`}
          </button>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">For captions, run the result through Auto Subtitles.</p>
        </>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-video)]/40 bg-[var(--color-cat-video)]/5 p-4">
          <video src={out.url} controls className="max-h-[60vh] w-full bg-black" />
          <a href={out.url} download={out.name} className="flex w-fit items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</a>
        </div>
      )}
    </div>
  );
}
