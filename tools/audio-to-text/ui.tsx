'use client';

import * as React from 'react';
import { Upload, Loader2, Copy, Download, FileText, Languages, Mic, Wand2, Music } from 'lucide-react';
import { cn } from '@/lib/cn';
import { transcribe, chunksToSrt, chunksToVtt, type TranscribeProgress, type TranscribeResult, type TranscribeSize } from '@/engines/transcribe';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { isMemoryConstrained } from '@/lib/compute/device-profile';

const POLICY_KEY = 'audio-to-text';

const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fa', label: 'Persian' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
];

const SIZES: { v: TranscribeSize; label: string; hint: string }[] = [
  { v: 'tiny',  label: 'Fast',     hint: '~40 MB download. Quick for everyday clips.' },
  { v: 'base',  label: 'Standard', hint: '~75 MB. A good balance of speed and accuracy.' },
  { v: 'small', label: 'Detailed', hint: '~150 MB. Best accuracy for tough audio.' },
];

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return '00:00';
  const total = Math.max(0, Math.floor(s));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function AudioToTextTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string>('');
  // Real media length (seconds), read from the loaded file's metadata, so the
  // policy 'input-duration' lever can fire on free over the 5-min cap before we
  // spend time loading the model and transcribing.
  const [duration, setDuration] = React.useState(0);
  const [language, setLanguage] = React.useState<string>('');
  const [size, setSize] = React.useState<TranscribeSize>('tiny');
  const [translate, setTranslate] = React.useState(false);
  const [error, setError] = React.useState('');
  // iPhone/low-memory profile (read after mount — no SSR mismatch): the engine
  // caps Whisper at base there, so the 'Detailed' (small) option is disabled.
  const [lowMem, setLowMem] = React.useState(false);
  React.useEffect(() => { setLowMem(isMemoryConstrained()); }, []);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<TranscribeProgress | null>(null);
  const [result, setResult] = React.useState<TranscribeResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const run = React.useCallback(async (target: File) => {
    const sizeHit = checkLever(POLICY_KEY, 'input-size', target.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    // Block free users whose audio/video exceeds the 5-min input-duration cap
    // before we load the model and transcribe. `duration` is 0 until metadata
    // resolves; checkLever returns null at 0, so a not-yet-probed file isn't
    // falsely blocked (it would fail the cap on the next run once known).
    const durHit = checkLever(POLICY_KEY, 'input-duration', duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    setRunning(true);
    setResult(null);
    setError('');
    setProgress({ phase: 'Preparing', ratio: 0 });
    try {
      const out = await transcribe(target, {
        size,
        language: language || undefined,
        translate,
        onProgress: (p) => setProgress(p),
      });
      setResult(out);
    } catch (err) {
      console.error('transcribe failed', err);
      setError((err as Error)?.name === 'DeviceLimitError' ? (err as Error).message : 'Could not transcribe this file on this device.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [size, language, translate, isPro, policyGate, duration]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('audio/') && !next.type.startsWith('video/')) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(next);
    setAudioUrl(URL.createObjectURL(next));
    setResult(null);
    // Read the true media duration up front so the policy gate has a real value.
    // A <video> element reports duration for audio-only files too.
    setDuration(0);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration)) setDuration(probe.duration);
      URL.revokeObjectURL(probe.src);
    };
    probe.src = URL.createObjectURL(next);
  }, [audioUrl]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const copyText = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can reject (iframe / cross-origin / permissions);
      // user can still see the transcript on screen.
    }
  };

  const download = (kind: 'txt' | 'srt' | 'vtt') => {
    if (!result || !file) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    let body = result.text;
    let mime = 'text/plain';
    if (kind === 'srt') { body = chunksToSrt(result.chunks); mime = 'application/x-subrip'; }
    if (kind === 'vtt') { body = chunksToVtt(result.chunks); mime = 'text/vtt'; }
    const blob = new Blob([body], { type: mime });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${base}.${kind}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {policyGate.element}
      <div className="space-y-4">
        {!file ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-4 px-6 text-center"
            >
              <div className="bg-white/[0.06] p-4">
                <Upload className="h-6 w-6 text-white/80" />
              </div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">
                  Drop an audio or video file
                </div>
                <div className="mt-1 text-[13px] text-white/55">
                  MP3 · WAV · M4A · OGG · MP4 — files stay on your device
                </div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
                or click to browse
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
            />
          </div>
        ) : (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Music className="h-4 w-4 shrink-0 text-[var(--color-cat-audio)]" />
                <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{file.name}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyText}
                  disabled={!result}
                  className={cn(
                    'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                    result ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                  )}
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {(['txt','srt','vtt'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => download(k)}
                    disabled={!result}
                    className={cn(
                      'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                      result ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                    )}
                  >
                    <Download className="h-3 w-3" />
                    .{k}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-black/[0.06] bg-[var(--color-surface-2)] px-4 py-3">
              <audio src={audioUrl} controls className="w-full" />
            </div>

            {running && (
              <div className="border-b border-black/[0.06] px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
                  <Wand2 className="h-3.5 w-3.5 animate-pulse" />
                  <span className="font-medium">{progress?.phase ?? 'Working'}…</span>
                  <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{Math.round((progress?.ratio ?? 0) * 100)}%</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
                  <div
                    className="h-full bg-[var(--color-cat-audio)] transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="max-h-[460px] overflow-y-auto px-4 py-3">
              {!running && !result && (
                <div className="py-12 text-center text-[13px] text-[var(--color-fg-subtle)]">
                  Press <strong>Transcribe</strong> to read the audio into text.
                </div>
              )}
              {result && result.chunks.length === 0 && result.text && (
                <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[var(--color-fg)]">{result.text}</pre>
              )}
              {result && result.chunks.length > 0 && (
                <div className="space-y-2">
                  {result.chunks.map((c, i) => (
                    <div key={i} className="grid grid-cols-[80px_1fr] gap-3 border-l-2 border-[var(--color-cat-audio)]/60 pl-3 py-1">
                      <div className="font-mono text-[11px] text-[var(--color-fg-muted)]">{formatTime(c.start)}</div>
                      <div className="text-[13px] leading-relaxed text-[var(--color-fg)]">{c.text.trim()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Model
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  disabled={running || (lowMem && s.v === 'small')}
                  onClick={() => setSize(s.v)}
                  className={cn(
                    'border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-60',
                    size === s.v
                      ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              {SIZES.find((s) => s.v === size)?.hint}
            </div>
          </div>

          <div className="border-t border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <Languages className="h-3.5 w-3.5" />
              Language
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={running}
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-audio)] disabled:opacity-60"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-black/[0.06] px-4 py-3">
            <label className="flex items-center justify-between text-[12px] text-[var(--color-fg)]">
              <span className="font-medium">Translate to English</span>
              <input
                type="checkbox"
                checked={translate}
                disabled={running}
                onChange={(e) => setTranslate(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <div className="mt-1 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              Off: transcribes in source language. On: outputs English no matter what was spoken.
            </div>
          </div>
        </div>

        {file && (
          <button
            type="button"
            onClick={() => void run(file)}
            disabled={running}
            className={cn(
              'flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold transition',
              running ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-audio)] text-white hover:brightness-110',
            )}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {running ? (progress?.phase ?? 'Working') + '…' : 'Transcribe'}
          </button>
        )}

        {error && <div className="text-[12px] leading-relaxed text-red-600">{error}</div>}

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60"
          >
            <FileText className="h-4 w-4" />
            Replace file
          </button>
        )}
      </aside>
    </div>
  );
}
