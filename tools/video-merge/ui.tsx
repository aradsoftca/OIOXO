'use client';
import * as React from 'react';
import { Upload, X, FileVideo } from 'lucide-react';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpegMulti, downloadBlob } from '@/engines/ffmpeg';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-merge';

interface VideoItem { file: File; }

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [items, setItems] = React.useState<VideoItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [name, setName] = React.useState('merged');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => {
    const next = Array.from(files).filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name));
    setItems((cur) => [...cur, ...next.map((file) => ({ file }))]);
  };

  const run = async () => {
    if (items.length < 2) { setError('Add at least 2 videos.'); return; }
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'batch', value: items.length },
    ]);
    if (!ok) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      // Re-encode each to identical format first using concat filter (safer than concat demuxer).
      const inputs = items.map((it, i) => ({ name: `in${i}.${it.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4'}`, data: it.file }));
      const n = inputs.length;
      const filterParts: string[] = [];
      for (let i = 0; i < n; i++) {
        filterParts.push(`[${i}:v]scale=1280:-2,setsar=1[v${i}];[${i}:a]aresample=async=1[a${i}]`);
      }
      const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join('');
      const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${n}:v=1:a=1[outv][outa]`;
      const blob = await runFfmpegMulti({
        inputs,
        outputName: 'out.mp4',
        args: (names, out) => [
          ...names.flatMap((n) => ['-i', n]),
          '-filter_complex', filterComplex,
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-c:a', 'aac', '-movflags', '+faststart',
          out,
        ],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, `${name || 'merged'}.mp4`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      <div
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-black/[0.15] bg-[var(--color-surface-1)] p-5"
      >
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 text-center">
          <Upload className="h-6 w-6 text-[var(--color-fg-muted)]" />
          <div className="text-[13px] font-semibold">Drop videos or click to add</div>
          <div className="text-[10px] text-[var(--color-fg-muted)]">MP4 · WebM · MOV · MKV</div>
        </button>
        <input ref={inputRef} type="file" accept="video/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
              <FileVideo className="h-4 w-4 text-[var(--color-cat-video)] shrink-0" />
              <span className="flex-1 text-[12px] truncate">{it.file.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(it.file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" disabled={i === 0}
                onClick={() => {
                  const next = [...items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setItems(next);
                }}
                className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↑</button>
              <button type="button" disabled={i === items.length - 1}
                onClick={() => {
                  const next = [...items]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setItems(next);
                }}
                className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↓</button>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
            <div className="mt-1 text-[14px] font-semibold">{name || 'merged'}.mp4</div>
            <div className="text-[12px] text-[var(--color-fg-muted)]">
              {items.length} clip{items.length === 1 ? '' : 's'} → single MP4 (re-scaled to 1280p)
            </div>
          </div>
          <aside className="space-y-3">
            <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Filename</div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-video)]" />
            </label>
            <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Merge & Download" busyLabel="Merging…" onClick={run} disabled={items.length < 2} error={error} />
          </aside>
        </div>
      )}
    </div>
  );
}
