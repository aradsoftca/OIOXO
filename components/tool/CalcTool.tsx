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

interface CalcToolProps {
  toolId: string;
  inputs: CalcInput[];
  compute: (values: Record<string, string | number>) => CalcResult[];
  colorVar?: string;
  /** Tagline above results explaining what we computed */
  formula?: string;
}

/**
 * Calculator template — N inputs, a compute function, a stack of results.
 * The primary result gets the big display; the rest line up under it.
 */
export function CalcTool({
  toolId,
  inputs,
  compute,
  colorVar = '--color-cat-calc',
  formula,
}: CalcToolProps) {
  const [values, setValues] = React.useState<Record<string, string | number>>(() =>
    Object.fromEntries(inputs.map((i) => [i.id, i.defaultValue ?? (i.type === 'number' ? 0 : '')])),
  );

  const results = React.useMemo(() => {
    try {
      return compute(values);
    } catch {
      return [];
    }
  }, [values, compute]);

  React.useEffect(() => {
    const primary = results.find((r) => r.primary) ?? results[0];
    if (!primary) return;
    const id = setTimeout(() => {
      const thumb = makeNumberThumb(String(primary.value), primary.unit);
      setRecent(toolId, thumb);
    }, 500);
    return () => clearTimeout(id);
  }, [results, toolId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="tile-surface" data-neutral="true">
        <div className="tile-content gap-4 !justify-start">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Inputs
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
              {results.map((r, i) => (
                <ResultRow key={`${r.label}-${i}`} result={r} colorVar={colorVar} />
              ))}
            </div>
          </div>
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
    </label>
  );
}

function ResultRow({ result, colorVar }: { result: CalcResult; colorVar: string }) {
  if (result.primary) {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
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
