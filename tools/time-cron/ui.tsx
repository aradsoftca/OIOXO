'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { nextRuns, describeCron } from '@/engines/time';
import { useCopy } from '@/lib/useCopy';
import { cn } from '@/lib/cn';

const PRESETS = [
  { label: 'Every minute',    expr: '* * * * *' },
  { label: 'Every hour',      expr: '0 * * * *' },
  { label: 'Every day 9am',   expr: '0 9 * * *' },
  { label: 'Workday 9am',     expr: '0 9 * * 1-5' },
  { label: 'Every 15 min',    expr: '*/15 * * * *' },
  { label: 'Monthly 1st',     expr: '0 0 1 * *' },
];

export default function Tool() {
  const [expr, setExpr] = React.useState('0 9 * * 1-5');
  const [error, setError] = React.useState('');
  const [runs, setRuns] = React.useState<Date[]>([]);
  const { copied, copy } = useCopy();

  React.useEffect(() => {
    try {
      const next = nextRuns(expr, Date.now(), 8);
      setRuns(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRuns([]);
    }
  }, [expr]);

  return (
    <div className="space-y-4">
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <label className="block">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Cron expression
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setExpr('* * * * *'); }}
              spellCheck={false}
              className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[20px] font-semibold tracking-wider text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-time)]"
            />
            <button
              type="button"
              onClick={() => copy(expr, 'expr')}
              disabled={!!error}
              title="Copy expression"
              className="mt-2 grid h-9 w-9 shrink-0 place-items-center border border-black/[0.08] text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-40"
            >
              {copied === 'expr'
                ? <Check className="h-4 w-4 text-[var(--color-cat-time)]" />
                : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">
          {error ? <span className="text-[oklch(58%_0.22_22)]">{error}</span> : describeCron(expr)}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.expr}
              type="button"
              onClick={() => setExpr(p.expr)}
              className={cn(
                'border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition',
                expr === p.expr
                  ? 'border-[var(--color-cat-time)] text-[var(--color-cat-time)]'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {runs.length > 0 && (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Next {runs.length} runs
            </span>
            <button
              type="button"
              onClick={() => copy(runs.map((r) => r.toISOString()).join('\n'), 'all')}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)] transition hover:text-[var(--color-fg)]"
            >
              {copied === 'all'
                ? <><Check className="h-3.5 w-3.5 text-[var(--color-cat-time)]" /> Copied</>
                : <><Copy className="h-3.5 w-3.5" /> Copy all</>}
            </button>
          </div>
          {runs.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => copy(r.toISOString(), `run-${i}`)}
              title="Click to copy"
              className="group flex w-full cursor-copy items-center justify-between gap-3 border-b border-black/[0.04] px-4 py-2.5 text-left transition last:border-0 hover:bg-[var(--color-surface-2)]"
            >
              <div className="font-mono text-[13px] text-[var(--color-fg)]">{r.toLocaleString()}</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-[11px] text-[var(--color-fg-subtle)]">{r.toISOString()}</div>
                <span className="opacity-0 transition group-hover:opacity-100">
                  {copied === `run-${i}`
                    ? <Check className="h-3.5 w-3.5 text-[var(--color-cat-time)]" />
                    : <Copy className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
