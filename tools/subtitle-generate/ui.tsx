'use client';

import * as React from 'react';
import { Upload, Loader2, Download, Wand2, Captions, Languages, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { transcribe, chunksToSrt, chunksToVtt, type TranscribeProgress, type TranscribeChunk, type TranscribeSize } from '@/engines/transcribe';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'subtitle-generate';

const LANGUAGES = [
  ['', 'Auto-detect'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['ja', 'Japanese'],
  ['zh', 'Chinese'], ['ko', 'Korean'], ['ar', 'Arabic'], ['fa', 'Persian'], ['hi', 'Hindi'],
  ['tr', 'Turkish'], ['pl', 'Polish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'], ['id', 'Indonesian'],
] as const;

const SIZES: { v: TranscribeSize; label: string; hint: string }[] = [
  { v: 'tiny', label: 'Fast', hint: '~40 MB. Quick for everyday clips.' },
  { v: 'base', label: 'Standard', hint: '~75 MB. Balanced speed and accuracy.' },
  { v: 'small', label: 'Detailed', hint: '~150 MB. Best for tough audio.' },
];

function fmt(s: number): string {
  if (!Number.isFinite(s)) return '0:00';
  const total = Math.max(0, Math.floor(s));
  const m = Math.floor(total / 60), ss = total % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export default function SubtitleGenerateTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [isVideo, setIsVideo] = React.useState(true);
  const [chunks, setChunks] = React.useState<TranscribeChunk[]>([]);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<TranscribeProgress | null>(null);
  const [language, setLanguage] = React.useState('');
  const [size, setSize] = React.useState<TranscribeSize>('base');
  const [activeIdx, setActiveIdx] = React.useState(-1);

  const mediaRef = React.useRef<HTMLVideoElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const loadFile = React.useCallback((next: File) => {
    if (!next.type.startsWith('video/') && !next.type.startsWith('audio/')) return;
    if (url) URL.revokeObjectURL(url);
    setFile(next);
    setUrl(URL.createObjectURL(next));
    setIsVideo(next.type.startsWith('video/'));
    setChunks([]);
  }, [url]);

  const run = React.useCallback(async () => {
    if (!file) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-size', value: file.size },
    ]);
    if (!ok) return;
    setRunning(true); setChunks([]); setProgress({ phase: 'Preparing', ratio: 0 });
    try {
      const out = await transcribe(file, { size, language: language || undefined, onProgress: (p) => setProgress(p) });
      setChunks(out.chunks.length ? out.chunks : (out.text ? [{ start: 0, end: 0, text: out.text }] : []));
    } catch (e) {
      console.error('subtitle generation failed', e);
    } finally {
      setRunning(false); setProgress(null);
    }
  }, [file, size, language]);

  // Sync the active caption with playback.
  const onTimeUpdate = () => {
    const t = mediaRef.current?.currentTime ?? 0;
    const idx = chunks.findIndex((c) => t >= c.start && t <= (c.end || c.start + 3));
    setActiveIdx(idx);
  };

  const editChunk = (i: number, text: string) =>
    setChunks((prev) => prev.map((c, j) => (j === i ? { ...c, text } : c)));

  const download = (kind: 'srt' | 'vtt' | 'txt') => {
    if (!file || !chunks.length) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    let body = '', mime = 'text/plain';
    if (kind === 'srt') { body = chunksToSrt(chunks); mime = 'application/x-subrip'; }
    else if (kind === 'vtt') { body = chunksToVtt(chunks); mime = 'text/vtt'; }
    else body = chunks.map((c) => c.text.trim()).join('\n');
    const blob = new Blob([body], { type: mime });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${base}.${kind}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const activeText = activeIdx >= 0 ? chunks[activeIdx]?.text.trim() : '';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {policyGate.element}
      <div className="space-y-4">
        {!file ? (
          <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }} onDragOver={(e) => e.preventDefault()}
            className="flex aspect-video items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a video or audio file</div>
                <div className="mt-1 text-[13px] text-white/55">MP4 · WebM · MP3 · WAV · M4A — files stay on your device</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
            <input ref={fileInputRef} type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
          </div>
        ) : (
          <div className="relative overflow-hidden border border-black/[0.08] bg-black">
            {/* video element drives playback for both video + audio files */}
            <video
              ref={mediaRef}
              src={url}
              controls
              onTimeUpdate={onTimeUpdate}
              className={cn('w-full', isVideo ? 'aspect-video object-contain' : 'h-20')}
            />
            {isVideo && activeText && (
              <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
                <span className="max-w-[90%] bg-black/70 px-3 py-1.5 text-center text-[clamp(14px,2.4vw,22px)] font-semibold leading-snug text-white">
                  {activeText}
                </span>
              </div>
            )}
          </div>
        )}

        {running && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
              <Wand2 className="h-3.5 w-3.5 animate-pulse" />
              <span className="font-medium">{progress?.phase ?? 'Working'}…</span>
              <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{Math.round((progress?.ratio ?? 0) * 100)}%</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
              <div className="h-full bg-[var(--color-cat-subtitle)] transition-[width] duration-200" style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }} />
            </div>
          </div>
        )}

        {chunks.length > 0 && (
          <div className="max-h-[420px] overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)]">
            {chunks.map((c, i) => (
              <div key={i} className={cn('flex items-start gap-3 border-b border-black/[0.04] px-3 py-2 last:border-b-0', activeIdx === i && 'bg-[var(--color-cat-subtitle)]/10')}>
                <button type="button" onClick={() => { if (mediaRef.current) { mediaRef.current.currentTime = c.start; void mediaRef.current.play(); } }}
                  className="shrink-0 pt-1 font-mono text-[11px] text-[var(--color-cat-subtitle)] hover:underline">{fmt(c.start)}</button>
                <textarea value={c.text} onChange={(e) => editChunk(i, e.target.value)} rows={1}
                  className="min-h-[28px] flex-1 resize-y bg-transparent text-[13px] leading-relaxed text-[var(--color-fg)] focus:outline-none" />
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Model</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {SIZES.map((s) => (
                <button key={s.v} type="button" disabled={running} onClick={() => setSize(s.v)}
                  className={cn('border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-60',
                    size === s.v ? 'border-[var(--color-cat-subtitle)] bg-[var(--color-cat-subtitle)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">{SIZES.find((s) => s.v === size)?.hint}</p>
          </div>
          <div className="border-t border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]"><Languages className="h-3.5 w-3.5" /> Language</div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={running}
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:border-[var(--color-cat-subtitle)] focus:outline-none disabled:opacity-60">
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
        </div>

        {file && (
          <button type="button" onClick={() => void run()} disabled={running}
            className={cn('flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold transition',
              running ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-subtitle)] text-white hover:brightness-110')}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Captions className="h-4 w-4" />}
            {running ? (progress?.phase ?? 'Working') + '…' : chunks.length ? 'Regenerate' : 'Generate subtitles'}
          </button>
        )}

        {chunks.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {(['srt', 'vtt', 'txt'] as const).map((k) => (
              <button key={k} type="button" onClick={() => download(k)}
                className="flex items-center justify-center gap-1.5 border border-black/[0.08] py-2.5 text-[12px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
                <Download className="h-3.5 w-3.5" /> .{k}
              </button>
            ))}
          </div>
        )}

        {file && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={running}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <FileText className="h-4 w-4" /> Replace file
          </button>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
          Edit any line above before exporting. Click a timecode to jump there. Everything runs in your browser — the file never leaves your device.
        </p>
      </aside>
    </div>
  );
}
