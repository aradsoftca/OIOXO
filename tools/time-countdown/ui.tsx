'use client';
import * as React from 'react';

function nextNewYear(): string {
  const y = new Date().getFullYear() + 1;
  return `${y}-01-01T00:00`;
}

export default function Tool() {
  const [target, setTarget] = React.useState(nextNewYear);
  const [label, setLabel] = React.useState('New Year');
  const [now, setNow] = React.useState(() => Date.now());

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

  return (
    <div className="space-y-6">
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6 md:p-10">
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
