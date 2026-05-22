'use client';

import * as React from 'react';
import { subscribeProgress, type ProgressState } from '@/lib/compute/progressBus';

/**
 * Slim top progress bar + corner pill, shown whenever a worker-backed job is
 * running (audio encode, image codec, …). Pure UI feedback — the work itself
 * is off the main thread, so this stays smooth even on a busy device.
 */
export function GlobalProgress() {
  const [s, setS] = React.useState<ProgressState>({ active: false, phase: '', ratio: 0 });
  React.useEffect(() => subscribeProgress(setS), []);

  if (!s.active) return null;
  const pct = Math.round(s.ratio * 100);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[200] h-0.5 bg-transparent">
        <div
          className="h-full transition-[width] duration-200"
          style={{ width: `${Math.max(4, pct)}%`, background: 'var(--brand-gradient)' }}
        />
      </div>
      <div className="fixed bottom-4 right-4 z-[200] flex items-center gap-2.5 rounded-full border border-black/[0.06] bg-white/95 px-4 py-2 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.25)] backdrop-blur">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/15 border-t-[var(--brand-1)]" />
        <span className="text-[12px] font-semibold text-[var(--color-fg)]">{s.phase}…</span>
        <span className="font-mono text-[12px] tabular-nums text-[var(--color-fg-muted)]">{pct}%</span>
      </div>
    </>
  );
}
