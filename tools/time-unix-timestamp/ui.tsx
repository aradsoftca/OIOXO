'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

function isNumeric(s: string): boolean {
  return /^\d{9,13}$/.test(s.trim());
}

interface Row { label: string; value: string }

export default function Tool() {
  const [input, setInput] = React.useState(() => String(Math.floor(Date.now() / 1000)));
  const [copied, setCopied] = React.useState<string | null>(null);

  const rows: Row[] = React.useMemo(() => {
    const s = input.trim();
    if (!s) return [];
    let d: Date;
    if (isNumeric(s)) {
      const n = Number(s);
      d = new Date(s.length >= 13 ? n : n * 1000);
    } else {
      d = new Date(s);
    }
    if (Number.isNaN(d.getTime())) return [{ label: 'Invalid', value: 'Enter a unix timestamp or ISO date' }];
    return [
      { label: 'Unix seconds',     value: String(Math.floor(d.getTime() / 1000)) },
      { label: 'Unix milliseconds', value: String(d.getTime()) },
      { label: 'ISO 8601 (UTC)',   value: d.toISOString() },
      { label: 'Local',            value: d.toString() },
      { label: 'RFC 2822',         value: d.toUTCString() },
      { label: 'Relative',         value: relativeTime(d) },
    ];
  }, [input]);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="space-y-4">
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <label className="block">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Timestamp or date
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1700000000 or 2024-01-15T12:00:00Z"
            className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[18px] tabular-nums text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-time)]"
          />
        </label>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}
            className="border border-black/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            Now
          </button>
          <button
            type="button"
            onClick={() => setInput(new Date().toISOString())}
            className="border border-black/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            Now as ISO
          </button>
        </div>
      </div>

      <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
        {rows.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => copy(r.label, r.value)}
            className="group flex w-full items-start justify-between gap-3 border-b border-black/[0.05] px-4 py-3 text-left transition last:border-0 hover:bg-[var(--color-surface-2)]"
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{r.label}</div>
              <div className="mt-0.5 font-mono text-[14px] font-semibold text-[var(--color-fg)]">{r.value}</div>
            </div>
            <span className={cn('mt-1 opacity-0 transition group-hover:opacity-100', copied === r.label && 'opacity-100')}>
              {copied === r.label
                ? <Check className="h-4 w-4 text-[var(--color-cat-time)]" />
                : <Copy className="h-4 w-4 text-[var(--color-fg-subtle)]" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function relativeTime(d: Date): string {
  const sec = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(sec);
  const future = sec > 0;
  const fmt = (n: number, unit: string) => `${future ? 'in ' : ''}${Math.round(n)} ${unit}${Math.round(n) === 1 ? '' : 's'}${future ? '' : ' ago'}`;
  if (abs < 60)         return fmt(abs, 'second');
  if (abs < 3600)       return fmt(abs / 60, 'minute');
  if (abs < 86_400)     return fmt(abs / 3600, 'hour');
  if (abs < 2_592_000)  return fmt(abs / 86_400, 'day');
  if (abs < 31_536_000) return fmt(abs / 2_592_000, 'month');
  return fmt(abs / 31_536_000, 'year');
}
