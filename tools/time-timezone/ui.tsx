'use client';
import * as React from 'react';
import { Copy, Check, ArrowLeftRight, Radio } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCopy } from '@/lib/useCopy';

const ZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tehran',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
];

function formatInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZoneName: 'shortOffset',
  }).format(date);
}

// Local "datetime-local" string for a Date as seen in a given timezone.
function toLocalInputValue(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export default function Tool() {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [from, setFrom] = React.useState(browserZone);
  const [to, setTo] = React.useState('Asia/Tokyo');
  const [live, setLive] = React.useState(false);
  const [dt, setDt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const { copied, copy } = useCopy();

  // Live mode: tick the displayed "when" to now every second.
  React.useEffect(() => {
    if (!live) return;
    const tick = () => setDt(toLocalInputValue(new Date(), from));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [live, from]);

  const baseDate = new Date(dt);
  const valid = !Number.isNaN(baseDate.getTime());
  const fromText = valid ? formatInZone(baseDate, from) : '—';
  const toText = valid ? formatInZone(baseDate, to) : '—';

  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_1fr_auto_1fr]">
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">When</div>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              title="Use the current moment, ticking live"
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition',
                live ? 'text-[var(--color-cat-time)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
              )}
            >
              <Radio className={cn('h-3 w-3', live && 'animate-pulse')} /> Live
            </button>
          </div>
          <input
            type="datetime-local"
            value={dt}
            onChange={(e) => { setLive(false); setDt(e.target.value); }}
            className="mt-2 w-full bg-transparent font-mono text-[14px] text-[var(--color-fg)] outline-none"
          />
        </label>
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">From timezone</div>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1 font-mono text-[13px] text-[var(--color-fg)] outline-none"
          >
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={swap}
          title="Swap from / to"
          className="grid place-items-center self-center border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] md:h-full md:self-stretch"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">To timezone</div>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1 font-mono text-[13px] text-[var(--color-fg)] outline-none"
          >
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => valid && copy(fromText, 'from')}
          title="Click to copy"
          className="group cursor-copy border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-left transition hover:bg-[var(--color-surface-2)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">In {from}</div>
            <span className="opacity-0 transition group-hover:opacity-100">
              {copied === 'from'
                ? <Check className="h-4 w-4 text-[var(--color-cat-time)]" />
                : <Copy className="h-4 w-4 text-[var(--color-fg-subtle)]" />}
            </span>
          </div>
          <div className="mt-2 font-mono text-[18px] font-semibold text-[var(--color-fg)]">{fromText}</div>
        </button>
        <button
          type="button"
          onClick={() => valid && copy(toText, 'to')}
          title="Click to copy"
          className="group cursor-copy border border-[var(--color-cat-time)] bg-[var(--color-surface-1)] p-4 text-left transition hover:bg-[var(--color-surface-2)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-cat-time)]">In {to}</div>
            <span className="opacity-0 transition group-hover:opacity-100">
              {copied === 'to'
                ? <Check className="h-4 w-4 text-[var(--color-cat-time)]" />
                : <Copy className="h-4 w-4 text-[var(--color-fg-subtle)]" />}
            </span>
          </div>
          <div className="mt-2 font-mono text-[18px] font-semibold text-[var(--color-fg)]">{toText}</div>
        </button>
      </div>
    </div>
  );
}
