'use client';
import * as React from 'react';

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

export default function Tool() {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [from, setFrom] = React.useState(browserZone);
  const [to, setTo] = React.useState('Asia/Tokyo');
  const [dt, setDt] = React.useState(() => new Date().toISOString().slice(0, 16));

  const baseDate = new Date(dt);
  const valid = !Number.isNaN(baseDate.getTime());

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">When</div>
          <input
            type="datetime-local"
            value={dt}
            onChange={(e) => setDt(e.target.value)}
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
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">In {from}</div>
          <div className="mt-2 font-mono text-[18px] font-semibold text-[var(--color-fg)]">
            {valid ? formatInZone(baseDate, from) : '—'}
          </div>
        </div>
        <div className="border border-[var(--color-cat-time)] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-cat-time)]">In {to}</div>
          <div className="mt-2 font-mono text-[18px] font-semibold text-[var(--color-fg)]">
            {valid ? formatInZone(baseDate, to) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
