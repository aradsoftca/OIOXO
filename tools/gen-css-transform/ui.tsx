'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';

interface P { key: string; label: string; fn: string; unit: string; min: number; max: number; step: number; def: number; }
const PROPS: P[] = [
  { key: 'translateX', label: 'Translate X', fn: 'translateX', unit: 'px',  min: -200, max: 200, step: 1,    def: 0 },
  { key: 'translateY', label: 'Translate Y', fn: 'translateY', unit: 'px',  min: -200, max: 200, step: 1,    def: 0 },
  { key: 'rotate',     label: 'Rotate',      fn: 'rotate',     unit: 'deg', min: -180, max: 180, step: 1,    def: 0 },
  { key: 'scaleX',     label: 'Scale X',     fn: 'scaleX',     unit: '',    min: 0,    max: 2,   step: 0.01, def: 1 },
  { key: 'scaleY',     label: 'Scale Y',     fn: 'scaleY',     unit: '',    min: 0,    max: 2,   step: 0.01, def: 1 },
  { key: 'skewX',      label: 'Skew X',      fn: 'skewX',      unit: 'deg', min: -90,  max: 90,  step: 1,    def: 0 },
  { key: 'skewY',      label: 'Skew Y',      fn: 'skewY',      unit: 'deg', min: -90,  max: 90,  step: 1,    def: 0 },
];
const ACCENT = 'var(--color-cat-generator)';

export default function Tool() {
  const [vals, setVals] = React.useState<Record<string, number>>(() => Object.fromEntries(PROPS.map((p) => [p.key, p.def])));
  const [copied, setCopied] = React.useState(false);

  const css = React.useMemo(() => {
    const parts = PROPS.filter((p) => vals[p.key] !== p.def).map((p) => `${p.fn}(${vals[p.key]}${p.unit})`);
    return parts.length ? parts.join(' ') : 'none';
  }, [vals]);

  const reset = () => setVals(Object.fromEntries(PROPS.map((p) => [p.key, p.def])));
  const copy = async () => {
    try { await navigator.clipboard?.writeText(`transform: ${css};`); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { /* iframe / permission denied */ }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        <div className="grid min-h-[320px] place-items-center overflow-hidden border border-black/[0.08] bg-[var(--color-surface-1)] [background-image:linear-gradient(45deg,rgba(0,0,0,.04)_25%,transparent_25%,transparent_75%,rgba(0,0,0,.04)_75%),linear-gradient(45deg,rgba(0,0,0,.04)_25%,transparent_25%,transparent_75%,rgba(0,0,0,.04)_75%)] [background-position:0_0,10px_10px] [background-size:20px_20px]">
          <div className="grid h-32 w-32 place-items-center text-[12px] font-bold uppercase tracking-wider text-white transition-transform"
            style={{ transform: css === 'none' ? undefined : css, background: 'var(--brand-gradient)' }}>
            Box
          </div>
        </div>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] break-all">transform: {css};</div>
        <button type="button" onClick={copy}
          className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90">
          {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy CSS</>}
        </button>
      </div>

      <aside className="space-y-2.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
        {PROPS.map((p) => (
          <div key={p.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-fg-muted)]">{p.label}</span>
              <span className="font-mono text-[11px] tabular-nums">{vals[p.key]}{p.unit}</span>
            </div>
            <input type="range" min={p.min} max={p.max} step={p.step} value={vals[p.key]}
              onChange={(e) => setVals((v) => ({ ...v, [p.key]: Number(e.target.value) }))}
              className="mt-1 w-full" style={{ accentColor: ACCENT }} />
          </div>
        ))}
        <button type="button" onClick={reset}
          className="w-full border border-black/[0.12] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">Reset</button>
      </aside>
    </div>
  );
}
