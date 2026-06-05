'use client';

import * as React from 'react';
import { CopyButton } from '@/components/tool/CopyButton';

interface F { key: string; label: string; unit: string; min: number; max: number; step: number; def: number; }
const FILTERS: F[] = [
  { key: 'blur',        label: 'Blur',        unit: 'px',  min: 0,   max: 20,  step: 0.1, def: 0 },
  { key: 'brightness',  label: 'Brightness',  unit: '%',   min: 0,   max: 200, step: 1,   def: 100 },
  { key: 'contrast',    label: 'Contrast',    unit: '%',   min: 0,   max: 200, step: 1,   def: 100 },
  { key: 'saturate',    label: 'Saturate',    unit: '%',   min: 0,   max: 300, step: 1,   def: 100 },
  { key: 'grayscale',   label: 'Grayscale',   unit: '%',   min: 0,   max: 100, step: 1,   def: 0 },
  { key: 'sepia',       label: 'Sepia',       unit: '%',   min: 0,   max: 100, step: 1,   def: 0 },
  { key: 'invert',      label: 'Invert',      unit: '%',   min: 0,   max: 100, step: 1,   def: 0 },
  { key: 'hue-rotate',  label: 'Hue rotate',  unit: 'deg', min: 0,   max: 360, step: 1,   def: 0 },
  { key: 'opacity',     label: 'Opacity',     unit: '%',   min: 0,   max: 100, step: 1,   def: 100 },
];
const ACCENT = 'var(--color-cat-generator)';

export default function Tool() {
  const [vals, setVals] = React.useState<Record<string, number>>(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.def])),
  );

  const css = React.useMemo(() => {
    const parts = FILTERS.filter((f) => vals[f.key] !== f.def)
      .map((f) => `${f.key}(${vals[f.key]}${f.unit})`);
    return parts.length ? parts.join(' ') : 'none';
  }, [vals]);

  const reset = () => setVals(Object.fromEntries(FILTERS.map((f) => [f.key, f.def])));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        <div className="relative grid min-h-[320px] place-items-center overflow-hidden border border-black/[0.08] bg-[conic-gradient(from_180deg_at_50%_50%,#ff6b6b,#ffd93d,#6bcB77,#4d96ff,#9b5de5,#ff6b6b)]">
          <div
            className="grid h-44 w-44 place-items-center rounded-2xl bg-white/90 text-center text-[13px] font-bold uppercase tracking-wider text-[var(--color-fg)] shadow-lg"
            style={{ filter: css }}
          >
            Live<br />preview
          </div>
        </div>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] break-all">
          filter: {css};
        </div>
        <CopyButton value={`filter: ${css};`} disabled={css === 'none'} />
      </div>

      <aside className="space-y-2.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
        {FILTERS.map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-fg-muted)]">{f.label}</span>
              <span className="font-mono text-[11px] tabular-nums">{vals[f.key]}{f.unit}</span>
            </div>
            <input type="range" min={f.min} max={f.max} step={f.step} value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
              className="mt-1 w-full" style={{ accentColor: ACCENT }} />
          </div>
        ))}
        <button type="button" onClick={reset}
          className="w-full border border-black/[0.12] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
          Reset
        </button>
      </aside>
    </div>
  );
}
