'use client';
import * as React from 'react';
import { X, Plus, Copy, Check } from 'lucide-react';
import { useCopy } from '@/lib/useCopy';

const DEFAULT_ZONES = [
  { id: 'America/Los_Angeles', label: 'San Francisco' },
  { id: 'America/New_York',    label: 'New York' },
  { id: 'Europe/London',       label: 'London' },
  { id: 'Europe/Berlin',       label: 'Berlin' },
  { id: 'Asia/Dubai',          label: 'Dubai' },
  { id: 'Asia/Tokyo',          label: 'Tokyo' },
];

const ADDABLE = [
  'UTC', 'Europe/Paris', 'Europe/Madrid', 'Europe/Moscow', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Tehran', 'Australia/Sydney',
  'Pacific/Auckland', 'America/Chicago', 'America/Denver', 'America/Sao_Paulo', 'America/Mexico_City',
];

interface Zone { id: string; label: string }

function offsetFor(tz: string, at: Date): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

export default function Tool() {
  const [zones, setZones] = React.useState<Zone[]>(DEFAULT_ZONES);
  const [now, setNow] = React.useState(() => new Date());
  const [adding, setAdding] = React.useState(false);
  const { copied, copy } = useCopy();

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {zones.map((z) => {
          const timeStr = new Intl.DateTimeFormat([], { timeZone: z.id, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
          return (
          <div key={z.id} className="group relative border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="absolute right-2 top-2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => copy(`${timeStr} ${z.id}`, z.id)}
                className="grid h-7 w-7 place-items-center text-[var(--color-fg-subtle)] opacity-0 transition hover:text-[var(--color-fg)] focus:opacity-100 group-hover:opacity-100"
                title="Copy time"
              >
                {copied === z.id
                  ? <Check className="h-3.5 w-3.5 text-[var(--color-cat-time)]" />
                  : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setZones((zs) => zs.filter((x) => x.id !== z.id))}
                className="grid h-7 w-7 place-items-center text-[var(--color-fg-subtle)] transition hover:text-[var(--color-fg)]"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              {z.label}
            </div>
            <button
              type="button"
              onClick={() => copy(`${timeStr} ${z.id}`, z.id)}
              title="Click to copy"
              className="mt-2 block cursor-copy text-left font-mono text-[38px] font-bold leading-none tabular-nums text-[var(--color-cat-time)]"
            >
              {timeStr}
            </button>
            <div className="mt-2 flex items-baseline justify-between text-[11px] font-mono text-[var(--color-fg-subtle)]">
              <span>{new Intl.DateTimeFormat([], { timeZone: z.id, weekday: 'short', month: 'short', day: '2-digit' }).format(now)}</span>
              <span>{offsetFor(z.id, now)}</span>
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">{z.id}</div>
          </div>
          );
        })}
      </div>

      {adding ? (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Add a timezone</div>
          <div className="flex flex-wrap gap-1.5">
            {ADDABLE.filter((id) => !zones.some((z) => z.id === id)).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setZones((zs) => [...zs, { id, label: id.split('/').pop()?.replace(/_/g, ' ') ?? id }]);
                  setAdding(false);
                }}
                className="border border-black/[0.08] px-2.5 py-1.5 text-[11px] font-mono text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              >
                {id}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-3 text-[11px] text-[var(--color-fg-subtle)] underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 border border-dashed border-black/[0.12] px-4 py-2.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition hover:border-black/[0.2] hover:text-[var(--color-fg)]"
        >
          <Plus className="h-4 w-4" /> Add timezone
        </button>
      )}
    </div>
  );
}
