'use client';
import * as React from 'react';
import { Loader2, Download, Scissors } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { trim, fadeIn, fadeOut, encodeMp3, encodeWav } from '@/engines/audio';
import { downloadBlob } from '@/engines/ffmpeg';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function RingtoneMaker() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(30);
  const [fade, setFade] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; blob: Blob } | null>(null);
  const { guard, gate } = useUsageGate('audio');

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);
  const load = (it: AudioFileItem) => { setItem(it); setStart(0); setEnd(Math.min(30, it.info.duration)); setOut(null); };

  const make = async () => {
    if (!item) return;
    if (!(await guard())) return;
    setBusy(true); setError('');
    try {
      let buf = trim(item.buffer, start, Math.min(end, start + 40)); // ringtones cap ~40s
      if (fade) { buf = fadeIn(buf, Math.min(1, (end - start) / 4)); buf = fadeOut(buf, Math.min(2, (end - start) / 3)); }
      const blob = await encodeMp3(buf, 192).catch(() => encodeWav(buf));
      setOut({ url: URL.createObjectURL(blob), blob });
    } catch (e) { setError((e as Error).message || 'Could not make the ringtone.'); }
    finally { setBusy(false); }
  };

  const len = Math.max(0, end - start);
  return (
    <div className="space-y-4">
      {gate}
      {!item ? <AudioDrop onLoad={load} loaded={false} /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmt(item.info.duration)}</span>
            <button type="button" onClick={() => { setItem(null); setOut(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
          </div>
          <div className="space-y-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px]">
            <label className="flex items-center gap-2"><Scissors className="h-3.5 w-3.5" /> Start
              <input type="range" min={0} max={item.info.duration} step={0.5} value={start} onChange={(e) => setStart(Math.min(+e.target.value, end - 1))} className="flex-1" />
              <span className="w-12 font-mono">{fmt(start)}</span>
            </label>
            <label className="flex items-center gap-2">End
              <input type="range" min={0} max={item.info.duration} step={0.5} value={end} onChange={(e) => setEnd(Math.max(+e.target.value, start + 1))} className="flex-1" />
              <span className="w-12 font-mono">{fmt(end)}</span>
            </label>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2"><input type="checkbox" checked={fade} onChange={(e) => setFade(e.target.checked)} /> Fade in / out</label>
              <span className="text-[var(--color-fg-muted)]">Clip length: <strong>{len.toFixed(1)}s</strong>{len > 40 ? ' (capped at 40s)' : ''}</span>
            </div>
          </div>
          <button type="button" onClick={make} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />} Make ringtone
          </button>
        </>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-audio)]/40 bg-[var(--color-cat-audio)]/5 p-4">
          <audio src={out.url} controls className="w-full" />
          <div className="flex gap-2">
            <button type="button" onClick={() => downloadBlob(out.blob, 'ringtone.mp3')} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> MP3</button>
            <button type="button" onClick={() => downloadBlob(out.blob, 'ringtone.m4r')} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2 text-[12px] font-semibold"><Download className="h-3.5 w-3.5" /> M4R (iPhone)</button>
          </div>
        </div>
      )}
    </div>
  );
}
