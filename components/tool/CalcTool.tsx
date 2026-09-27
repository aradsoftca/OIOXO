'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';

export interface CalcInput {
  id: string;
  label: string;
  unit?: string;
  type?: 'number' | 'date' | 'text' | 'select';
  defaultValue?: string | number;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  /** When min+max are set, render a drag slider beside the number field (real-time recalc). Defaults to true. */
  slider?: boolean;
}

export interface CalcResult {
  label: string;
  value: string | number;
  unit?: string;
  /** Mark one result as primary — gets the big display */
  primary?: boolean;
  /** Optional helper text below the result */
  hint?: string;
}

/** A single slice/bar of the optional breakdown chart. */
export interface CalcChartSegment {
  label: string;
  value: number;
  /** CSS color (e.g. a var() expression). Falls back to a generated palette. */
  color?: string;
}

export interface CalcChartSpec {
  type: 'donut' | 'bars';
  segments: CalcChartSegment[];
  /** Optional title shown above the chart. */
  title?: string;
  /** Formatter for segment values in the legend. */
  format?: (n: number) => string;
}

interface CalcToolProps {
  toolId: string;
  inputs: CalcInput[];
  compute: (values: Record<string, string | number>) => CalcResult[];
  colorVar?: string;
  /** Tagline above results explaining what we computed */
  formula?: string;
  /** Optional visual breakdown derived from the current values. Returns null to hide. */
  chart?: (values: Record<string, string | number>) => CalcChartSpec | null;
}

/**
 * Calculator template — N inputs, a compute function, a stack of results.
 * The primary result gets the big display; the rest line up under it.
 * Inputs with min+max gain a drag slider; results gain copy/reset + an
 * optional visual breakdown chart.
 */
export function CalcTool({
  toolId,
  inputs,
  compute,
  colorVar = '--color-cat-calc',
  formula,
  chart,
}: CalcToolProps) {
  const defaults = React.useMemo(
    () =>
      Object.fromEntries(
        inputs.map((i) => [i.id, i.defaultValue ?? (i.type === 'number' ? 0 : '')]),
      ) as Record<string, string | number>,
    [inputs],
  );
  const [values, setValues] = React.useState<Record<string, string | number>>(defaults);
  const [copied, setCopied] = React.useState(false);

  const results = React.useMemo(() => {
    try {
      return compute(values);
    } catch {
      return [];
    }
  }, [values, compute]);

  const chartSpec = React.useMemo(() => {
    if (!chart) return null;
    try {
      return chart(values);
    } catch {
      return null;
    }
  }, [values, chart]);

  React.useEffect(() => {
    const primary = results.find((r) => r.primary) ?? results[0];
    if (!primary) return;
    const id = setTimeout(() => {
      const thumb = makeNumberThumb(String(primary.value), primary.unit);
      setRecent(toolId, thumb);
    }, 500);
    return () => clearTimeout(id);
  }, [results, toolId]);

  const isDirty = React.useMemo(
    () => inputs.some((i) => String(values[i.id]) !== String(defaults[i.id])),
    [values, defaults, inputs],
  );

  const reset = React.useCallback(() => setValues(defaults), [defaults]);

  const copy = React.useCallback(async () => {
    const lines = results
      .filter((r) => r.value !== '—')
      .map((r) => `${r.label}: ${r.value}${r.unit ? ' ' + r.unit : ''}`);
    if (!lines.length) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silent */
    }
  }, [results]);

  // Esc anywhere on the tool resets to defaults (ignored while not dirty).
  const rootRef = React.useRef<HTMLDivElement>(null);
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        reset();
      }
    },
    [isDirty, reset],
  );

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"
    >
      <div className="tile-surface" data-neutral="true">
        <div className="tile-content gap-4 !justify-start">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Inputs
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={!isDirty}
              className={cn(
                'text-[11px] font-medium tracking-wide transition',
                isDirty
                  ? 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                  : 'cursor-default text-[var(--color-fg-subtle)] opacity-40',
              )}
              title="Reset to defaults (Esc)"
            >
              Reset
            </button>
          </div>
          {inputs.map((input) => (
            <CalcInputRow
              key={input.id}
              input={input}
              value={values[input.id]}
              onChange={(v) => setValues((s) => ({ ...s, [input.id]: v }))}
              colorVar={colorVar}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {formula && (
          <div className="border border-black/[0.06] bg-white/60 px-4 py-3 font-mono text-[12px] text-[var(--color-fg-muted)]">
            {formula}
          </div>
        )}
        {results.length > 0 && (
          <div
            className="tile-surface"
            style={{ ['--tile-color' as string]: `color-mix(in oklch, var(${colorVar}) 18%, var(--color-surface-1))`, ['--tile-fg' as string]: 'var(--color-fg)' }}
          >
            <div className="tile-content gap-4 !justify-start">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                  Result
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 border border-black/[0.08] bg-white/50 px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition hover:border-[color:var(--tile-color)] hover:text-[var(--color-fg)]"
                  style={{ ['--tile-color' as string]: `var(${colorVar})` }}
                  title="Copy results"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {results.map((r, i) => (
                <ResultRow key={`${r.label}-${i}`} result={r} colorVar={colorVar} />
              ))}
            </div>
          </div>
        )}
        {chartSpec && chartSpec.segments.length > 0 && (
          <BreakdownChart spec={chartSpec} colorVar={colorVar} />
        )}
      </div>
    </div>
  );
}

function CalcInputRow({
  input,
  value,
  onChange,
  colorVar,
}: {
  input: CalcInput;
  value: string | number;
  onChange: (v: string | number) => void;
  colorVar: string;
}) {
  const t = input.type ?? 'number';
  const hasRange =
    t === 'number' &&
    input.slider !== false &&
    typeof input.min === 'number' &&
    typeof input.max === 'number' &&
    input.max > input.min;
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{input.label}</span>
        {input.unit && (
          <span className="text-[11px] text-[var(--color-fg-subtle)]">{input.unit}</span>
        )}
      </div>
      {t === 'select' ? (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-black/[0.08] bg-white/60 px-3 py-2 text-[14px] text-[var(--color-fg)] focus:border-[var(--color-cat-calc)] focus:outline-none"
        >
          {input.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={t === 'date' ? 'date' : t === 'text' ? 'text' : 'number'}
          value={value as string | number}
          placeholder={input.placeholder}
          min={input.min}
          max={input.max}
          step={input.step ?? (t === 'number' ? 'any' : undefined)}
          onChange={(e) => onChange(t === 'number' ? Number(e.target.value) : e.target.value)}
          className={cn(
            'w-full border border-black/[0.08] bg-white/60 px-3 py-2 font-mono text-[15px] text-[var(--color-fg)] focus:outline-none transition',
            'focus:border-[color:var(--tile-color,var(--color-cat-calc))]',
          )}
          style={{ ['--tile-color' as string]: `var(${colorVar})` }}
        />
      )}
      {hasRange && (
        <input
          type="range"
          value={Number(value) || 0}
          min={input.min}
          max={input.max}
          step={input.step ?? (input.max! - input.min!) / 100}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`${input.label} slider`}
          className="calc-slider mt-0.5 w-full"
          style={{ ['--tile-color' as string]: `var(${colorVar})` }}
        />
      )}
    </label>
  );
}

function ResultRow({ result, colorVar }: { result: CalcResult; colorVar: string }) {
  if (result.primary) {
    return (
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          {result.label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className="font-mono text-[44px] font-bold leading-none tracking-tight tabular-nums"
            style={{ color: `var(${colorVar})` }}
          >
            {result.value}
          </span>
          {result.unit && (
            <span className="text-[14px] font-medium text-[var(--color-fg-muted)]">{result.unit}</span>
          )}
        </div>
        {result.hint && <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">{result.hint}</div>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-black/[0.08] pt-3 first:border-0 first:pt-0">
      <div className="text-[13px] text-[var(--color-fg-muted)]">
        {result.label}
        {result.hint && <div className="text-[11px] text-[var(--color-fg-subtle)]">{result.hint}</div>}
      </div>
      <div className="font-mono text-[16px] font-semibold text-[var(--color-fg)] tabular-nums">
        {result.value}
        {result.unit && <span className="ml-1 text-[12px] font-medium text-[var(--color-fg-muted)]">{result.unit}</span>}
      </div>
    </div>
  );
}

/** Generated palette around the tool's accent hue when a segment has no explicit color. */
function paletteColor(i: number, colorVar: string): string {
  const mixes = [
    `var(${colorVar})`,
    `color-mix(in oklch, var(${colorVar}) 62%, var(--color-surface-2))`,
    `color-mix(in oklch, var(${colorVar}) 42%, var(--color-surface-2))`,
    `color-mix(in oklch, var(${colorVar}) 26%, var(--color-surface-2))`,
    `color-mix(in oklch, var(${colorVar}) 14%, var(--color-surface-2))`,
  ];
  return mixes[i % mixes.length];
}

function BreakdownChart({ spec, colorVar }: { spec: CalcChartSpec; colorVar: string }) {
  const fmt = spec.format ?? ((n: number) => n.toLocaleString());
  const segs = spec.segments.map((s, i) => ({
    ...s,
    value: Math.max(0, Number(s.value) || 0),
    color: s.color ?? paletteColor(i, colorVar),
  }));
  const total = segs.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;

  return (
    <div className="tile-surface" data-neutral="true">
      <div className="tile-content gap-4 !justify-start">
        {spec.title && (
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            {spec.title}
          </div>
        )}
        {spec.type === 'donut' ? (
          <div className="flex items-center gap-5">
            <Donut segs={segs} total={total} />
            <Legend segs={segs} total={total} fmt={fmt} />
          </div>
        ) : (
          <Bars segs={segs} total={total} fmt={fmt} />
        )}
      </div>
    </div>
  );
}

function Donut({
  segs,
  total,
}: {
  segs: Array<CalcChartSegment & { color: string }>;
  total: number;
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="14" />
      {segs.map((s, i) => {
        const frac = s.value / total;
        const len = frac * c;
        const el = (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            style={{ transition: 'stroke-dasharray 220ms var(--ease-snap, ease), stroke-dashoffset 220ms var(--ease-snap, ease)' }}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function Legend({
  segs,
  total,
  fmt,
}: {
  segs: Array<CalcChartSegment & { color: string }>;
  total: number;
  fmt: (n: number) => string;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      {segs.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="h-2.5 w-2.5 shrink-0" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate text-[var(--color-fg-muted)]">{s.label}</span>
          <span className="shrink-0 font-mono tabular-nums text-[var(--color-fg)]">{fmt(s.value)}</span>
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--color-fg-subtle)]">
            {((s.value / total) * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function Bars({
  segs,
  total,
  fmt,
}: {
  segs: Array<CalcChartSegment & { color: string }>;
  total: number;
  fmt: (n: number) => string;
}) {
  const max = Math.max(...segs.map((s) => s.value), 1);
  return (
    <div className="space-y-2">
      {segs.map((s, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="truncate text-[var(--color-fg-muted)]">{s.label}</span>
            <span className="ml-2 shrink-0 font-mono tabular-nums text-[var(--color-fg)]">{fmt(s.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden bg-[var(--color-surface-2)]">
            <div
              className="h-full"
              style={{
                width: `${(s.value / max) * 100}%`,
                background: s.color,
                transition: 'width 240ms var(--ease-snap, ease)',
              }}
            />
          </div>
        </div>
      ))}
      <div className="pt-1 text-right text-[11px] font-mono tabular-nums text-[var(--color-fg-subtle)]">
        Total {fmt(total)}
      </div>
    </div>
  );
}

function makeNumberThumb(value: string, unit?: string): string {
  if (typeof document === 'undefined') return '';
  const w = 192;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = 'oklch(95% 0.012 80)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'oklch(20% 0.008 80)';
  ctx.font = '700 32px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(value.length > 8 ? value.slice(0, 8) : value, w / 2, h / 2 + 4);
  if (unit) {
    ctx.fillStyle = 'oklch(50% 0.008 80)';
    ctx.font = '500 11px ui-sans-serif, system-ui';
    ctx.fillText(unit, w / 2, h / 2 + 24);
  }
  return canvas.toDataURL('image/jpeg', 0.55);
}
