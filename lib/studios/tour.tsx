'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface TourStep {
  id: string;
  title: string;
  body: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  accentColor?: string;
}

export function StudiosTour({
  steps,
  storageKey = 'studios-tour-seen',
  brand = 'Studios Pro',
}: {
  steps: TourStep[];
  storageKey?: string;
  brand?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(storageKey)) {
        const id = window.setTimeout(() => setOpen(true), 500);
        return () => window.clearTimeout(id);
      }
    } catch {}
  }, [storageKey]);

  React.useEffect(() => {
    if (!open) { setEntered(false); return; }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(storageKey, '1'); } catch {}
  };
  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else dismiss();
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setStep(0); }}
        className="fixed right-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0f1115]/90 px-3 py-1.5 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur transition-colors hover:bg-white/5 hover:text-white"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Show tour"
      >
        <span>✨</span>
        <span>Take the tour</span>
      </button>
    );
  }

  const current = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-opacity duration-200',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Suite tour"
    >
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          'flex max-h-[90vh] w-[640px] max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1115] shadow-2xl transition-all duration-300',
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0',
        )}
      >
        <div className="relative h-1 bg-white/5">
          <div className="h-full bg-cyan-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">{brand}</span>
            <span className="text-[10px] text-zinc-500">Tour · {step + 1} / {steps.length}</span>
          </div>
          <button
            onClick={dismiss}
            className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Skip tour"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-4">
            {current.icon && (
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-lg"
                style={{ background: current.accentColor ?? 'linear-gradient(135deg, #22d3ee, #a855f7)' }}
              >
                {current.icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-bold tracking-tight text-zinc-100">{current.title}</h2>
              <div className="mt-2 text-[13px] leading-relaxed text-zinc-400">{current.body}</div>
              {current.href && (
                <Link
                  href={current.href}
                  onClick={dismiss}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                >
                  Open it →
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/5 bg-white/[.02] px-5 py-3">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-6 bg-cyan-400' : 'w-1.5 bg-white/15 hover:bg-white/30',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={dismiss} className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200">Skip</button>
            {step > 0 && (
              <button onClick={prev} className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5">← Prev</button>
            )}
            <button
              onClick={next}
              className="rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-cyan-400"
            >
              {step === steps.length - 1 ? "Let's go" : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SUITE_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Studios Pro',
    body: (
      <>
        Nine pro creative editors — photo, video, audio, subtitles, PDF, spreadsheets, documents, slides — every one runs <strong className="text-zinc-200">entirely on your device</strong>. Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">?</kbd> anywhere to see shortcuts.
      </>
    ),
    icon: <span className="text-xl">✨</span>,
    accentColor: 'linear-gradient(135deg, #22d3ee, #a855f7)',
  },
  {
    id: 'image',
    title: 'Image Studio — Photoshop-class',
    body: (
      <>
        Layers + 16 blend modes + masks + AI background remove + smart-crop + 14 color grades + layer animations.
      </>
    ),
    href: '/tools/image-studio',
    icon: <span className="text-xl">🎨</span>,
    accentColor: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  },
  {
    id: 'video',
    title: 'Video Studio — DaVinci-class',
    body: (
      <>
        Multi-track NLE with color wheels, RGB curves, 3 scopes, per-clip keyframes, 28 templates, 14 LUTs, ffmpeg.wasm export.
      </>
    ),
    href: '/tools/video-studio',
    icon: <span className="text-xl">🎬</span>,
    accentColor: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
  },
  {
    id: 'audio',
    title: 'Audio — Voice + Music',
    body: (
      <>
        Voice DAW with effect rack, LUFS meter, spectrogram. Music Studio with 8 synth instruments, audio→MIDI pitch detection, master chain.
      </>
    ),
    href: '/tools/audio-voice-studio',
    icon: <span className="text-xl">🎙️</span>,
    accentColor: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
  },
  {
    id: 'subtitle',
    title: 'Subtitle Studio — Aegisub-class',
    body: (
      <>
        Waveform-synced cue editor, on-device Whisper auto-transcribe, automatic speaker diarization, frame-accurate jog, SRT/VTT/ASS export.
      </>
    ),
    href: '/tools/subtitle-studio',
    icon: <span className="text-xl">💬</span>,
    accentColor: 'linear-gradient(135deg, #10b981, #06b6d4)',
  },
  {
    id: 'pdf',
    title: 'PDF Studio — Acrobat-class',
    body: (
      <>
        Annotate, redact, sign, draw. OCR (20 languages) → searchable PDF. Smart Redact auto-detects PII. Watermark, split, PDF→Word.
      </>
    ),
    href: '/tools/pdf-studio',
    icon: <span className="text-xl">📄</span>,
    accentColor: 'linear-gradient(135deg, #ef4444, #f59e0b)',
  },
  {
    id: 'office',
    title: 'Office — Sheets, Docs, Slides',
    body: (
      <>
        Excel-class spreadsheet with 140 formulas + pivot + charts. Word-class with track changes + KaTeX equations + read aloud. PowerPoint-class with 24 animations + SmartArt.
      </>
    ),
    href: '/tools/office-studio',
    icon: <span className="text-xl">📊</span>,
    accentColor: 'linear-gradient(135deg, #84cc16, #22c55e)',
  },
  {
    id: 'collab',
    title: 'Live P2P collaboration',
    body: (
      <>
        Share Docs and Slides in real time over WebRTC — end-to-end encrypted, no server, no account. Comments, track changes, presence cursors.
      </>
    ),
    icon: <span className="text-xl">🤝</span>,
    accentColor: 'linear-gradient(135deg, #a855f7, #ec4899)',
  },
  {
    id: 'ready',
    title: 'You\'re all set',
    body: (
      <>
        Every studio remembers your work via local Library. Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">?</kbd> in any studio to see its shortcuts. The "Take the tour" button stays in the corner if you want to revisit.
      </>
    ),
    icon: <span className="text-xl">🚀</span>,
    accentColor: 'linear-gradient(135deg, #22d3ee, #84cc16)',
  },
];
