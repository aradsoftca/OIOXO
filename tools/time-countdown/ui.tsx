'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { useCopy } from '@/lib/useCopy';

function nextNewYear(): string {
  const y = new Date().getFullYear() + 1;
  return `${y}-01-01T00:00`;
}

function localInput(ms: number): string {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const PRESETS: Array<{ label: string; at: () => string }> = [
  { label: 'New Year',    at: nextNewYear },
  { label: 'In 1 hour',   at: () => localInput(Date.now() + 3_600_000) },
  { label: 'Tomorrow 9am', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return localInput(d.getTime()); } },
  { label: 'Next week',   at: () => localInput(Date.now() + 7 * 86_400_000) },
];

export default function Tool() {
  const [target, setTarget] = React.useState(nextNewYear);
  const [label, setLabel] = React.useState('New Year');
  const [now, setNow] = React.useState(() => Date.now());
  const { copied, copy } = useCopy();

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = new Date(target).getTime();
  const valid = !Number.isNaN(targetMs);
  const diff = valid ? targetMs - now : 0;
  const past = diff < 0;
  const absSec = Math.abs(diff) / 1000;

  const days    = Math.floor(absSec / 86_400);
  const hours   = Math.floor((absSec % 86_400) / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = Math.floor(absSec % 60);

  const remainingText = `${label}: ${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s ${past ? 'ago' : 'remaining'}`;

  return (
    <div className="space-y-6">
      <div className="relative border border-black/[0.08] bg-[var(--color-surface-1)] p-6 md:p-10">
        {valid && (
          <button
            type="button"
            onClick={() => copy(remainingText, 'remain')}
            title="Copy remaining time"
            className="absolute right-3 top-3 flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            {copied === 'remain'
              ? <><Check className="h-3.5 w-3.5 text-[var(--color-cat-time)]" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        )}
        <div className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          {label} {past ? '— passed' : '— in'}
        </div>
        {!valid && (
          <div className="mt-4 text-center text-[14px] text-[oklch(58%_0.22_22)]">
            Pick a target date below
          </div>
        )}
        {valid && (
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              ['Days', days],
              ['Hours', hours],
              ['Minutes', minutes],
              ['Seconds', seconds],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div className="font-mono text-[44px] font-bold tabular-nums text-[var(--color-cat-time)] sm:text-[68px]">
                  {String(v).padStart(2, '0')}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{k as string}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Target</div>
          <input
            type="datetime-local"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-2 w-full bg-transparent font-mono text-[16px] text-[var(--color-fg)] outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setTarget(p.at()); setLabel(p.label); }}
                className="border border-black/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </label>
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Label</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What are we counting down to?"
            className="mt-2 w-full bg-transparent text-[16px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
          />
        </label>
      </div>
    </div>
  );
}
