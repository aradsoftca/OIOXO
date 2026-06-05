'use client';
import * as React from 'react';

const DURATIONS = [5, 10, 30, 60];

export default function CpsTest() {
  const [duration, setDuration] = React.useState(5);
  const [clicks, setClicks] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [left, setLeft] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const startRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);

  const tick = React.useCallback(() => {
    const remain = duration - (performance.now() - startRef.current) / 1000;
    if (remain <= 0) { setLeft(0); setRunning(false); return; }
    setLeft(remain); rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  React.useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const pad = () => {
    if (!running) {
      // first click starts the run
      setClicks(1); setRunning(true); startRef.current = performance.now(); setLeft(duration);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    setClicks((c) => c + 1);
  };

  React.useEffect(() => {
    if (!running && clicks > 0 && left === 0) {
      const cps = clicks / duration;
      if (cps > best) setBest(cps);
    }
  }, [running, clicks, left, duration, best]);

  const cps = running ? (clicks / Math.max(0.001, duration - left)) : (clicks / duration);
  const finished = !running && clicks > 0 && left === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Duration</span>
        {DURATIONS.map((d) => (
          <button key={d} type="button" disabled={running} onClick={() => { setDuration(d); setClicks(0); setLeft(0); }}
            className={`border px-3 py-1.5 text-[12px] font-semibold ${duration === d ? 'border-[var(--color-cat-test)] bg-[var(--color-cat-test)]/10' : 'border-black/[0.12]'} disabled:opacity-50`}>{d}s</button>
        ))}
        <button type="button" onClick={() => { setClicks(0); setLeft(0); setRunning(false); }} className="ml-auto border border-black/[0.12] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]">Reset</button>
      </div>

      <button type="button" onPointerDown={pad}
        className="flex h-72 w-full select-none flex-col items-center justify-center bg-[var(--color-cat-test)] text-white transition active:brightness-90"
        style={{ touchAction: 'manipulation' }}>
        <span className="text-[44px] font-extrabold tabular-nums">{clicks}</span>
        <span className="text-[14px] opacity-90">{running ? `${left.toFixed(1)}s left — keep clicking!` : finished ? 'Done — click to restart' : 'Click here to start'}</span>
      </button>

      <div className="flex flex-wrap items-center gap-6">
        <Stat label="CPS" value={cps.toFixed(2)} big />
        <Stat label="Clicks" value={clicks} />
        <Stat label="Best CPS" value={best.toFixed(2)} />
      </div>
    </div>
  );
}
function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (<div><div className={`tabular-nums font-bold tracking-tight ${big ? 'text-[30px] text-[var(--color-cat-test)]' : 'text-[20px]'}`}>{value}</div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div></div>);
}
