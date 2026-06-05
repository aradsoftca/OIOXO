'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Category } from '@/lib/registry/types';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { isLoaded as ffmpegLoaded } from '@/engines/ffmpeg';

interface Props {
  colorVar: string;
  busy: boolean;
  progress: number;
  disabled?: boolean;
  label: string;
  busyLabel: string;
  onClick: () => void;
  error?: string;
  /** When set, the click is metered through the freemium gate for this category. */
  gateCategory?: Category;
  /** Input file size (bytes) — enables the free-tier size gate for this action. */
  gateBytes?: number;
}

export function FfmpegRunButton({ colorVar, busy, progress, disabled = false, label, busyLabel, onClick, error, gateCategory, gateBytes }: Props) {
  const { guard, gate } = useUsageGate(gateCategory ?? 'video');

  // The single biggest "is this frozen?" moment is the first job, where the
  // engine downloads + compiles a 30 MB+ core BEFORE any progress event can
  // fire — the percentage sits at 0 for 10-30s. Detect that warm-up window so
  // we can show an honest, *moving* indeterminate bar instead of a dead "0%".
  const [warming, setWarming] = React.useState(false);
  React.useEffect(() => {
    if (!busy) { setWarming(false); return; }
    // If the core is already loaded this session, there's no warm-up phase.
    if (ffmpegLoaded()) { setWarming(false); return; }
    setWarming(true);
    // Poll until the core finishes loading; from then on real progress drives.
    const id = window.setInterval(() => { if (ffmpegLoaded()) setWarming(false); }, 300);
    return () => window.clearInterval(id);
  }, [busy]);

  // Progress is only meaningful once it has actually started moving. Treat the
  // 0% / warm-up window and the 100%→download tail (watermark overlay + mux)
  // as indeterminate so the bar always animates and never looks stuck.
  const hasReal = progress > 0 && progress < 100;
  const indeterminate = busy && !hasReal;
  const pct = Math.max(0, Math.min(100, progress));

  // Only show the warm-up copy while we're genuinely still at 0% (no real work
  // reported yet). The moment any progress arrives — including from non-ffmpeg
  // engines like gif.js — we switch to the live percentage.
  const showWarming = warming && progress <= 0;
  const phaseLabel = !busy
    ? label
    : showWarming
      ? 'Warming up engine…'
      : progress >= 100
        ? 'Finishing…'
        : `${busyLabel} ${pct}%`;

  const handleClick = async () => {
    if (gateCategory && !(await guard(gateBytes != null ? { bytes: gateBytes } : undefined))) return;
    onClick();
  };

  const accent = `var(${colorVar})`;

  return (
    <div className="space-y-2">
      {gateCategory && gate}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        aria-busy={busy}
        className={`relative flex w-full items-center justify-center gap-2 overflow-hidden py-3 text-[12px] font-bold uppercase tracking-wider shadow-lg transition hover:brightness-110 disabled:shadow-none ${
          busy ? 'text-white' : disabled ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'text-white'
        }`}
        style={{ background: busy ? 'rgba(0,0,0,0.85)' : !disabled ? accent : undefined }}
      >
        {/* Live progress fill behind the label while running. */}
        {busy && (
          indeterminate ? (
            <span
              aria-hidden
              className="ffmpeg-indeterminate pointer-events-none absolute inset-y-0 left-0 w-1/3"
              style={{ background: accent, opacity: 0.85 }}
            />
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%`, background: accent, opacity: 0.9 }}
            />
          )
        )}
        <span className="relative flex items-center gap-2">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {phaseLabel}
        </span>
      </button>
      {/* Thin determinate track under the button — the classic "real progress"
          affordance rivals (Clideo/Kapwing) show, so heavy jobs never feel hung. */}
      {busy && !indeterminate && (
        <div className="h-1 w-full overflow-hidden bg-black/[0.08]">
          <div className="h-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%`, background: accent }} />
        </div>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      <style jsx>{`
        .ffmpeg-indeterminate {
          animation: ffmpeg-slide 1.15s ease-in-out infinite;
        }
        @keyframes ffmpeg-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
