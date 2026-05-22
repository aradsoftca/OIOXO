'use client';
import * as React from 'react';
import { nextRuns, describeCron } from '@/engines/time';

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
          <input
            type="text"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[20px] font-semibold tracking-wider text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-time)]"
          />
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
              className="border border-black/[0.08] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {runs.length > 0 && (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="border-b border-black/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Next {runs.length} runs
          </div>
          {runs.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-black/[0.04] px-4 py-2.5 last:border-0">
              <div className="font-mono text-[13px] text-[var(--color-fg)]">{r.toLocaleString()}</div>
              <div className="font-mono text-[11px] text-[var(--color-fg-subtle)]">{r.toISOString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
