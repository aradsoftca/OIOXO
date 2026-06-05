'use client';
import * as React from 'react';

export default function MouseTest() {
  const [btns, setBtns] = React.useState<Set<number>>(new Set());
  const [seen, setSeen] = React.useState<Set<number>>(new Set());
  const [scroll, setScroll] = React.useState(0);
  const [dblMs, setDblMs] = React.useState<number | null>(null);
  const [hz, setHz] = React.useState(0);
  const [hzMax, setHzMax] = React.useState(0);
  const lastClick = React.useRef(0);
  const moveTimes = React.useRef<number[]>([]);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setBtns((s) => new Set(s).add(e.button));
    setSeen((s) => new Set(s).add(e.button));
    const t = performance.now();
    if (lastClick.current && t - lastClick.current < 600) setDblMs(Math.round(t - lastClick.current));
    lastClick.current = t;
  };
  const onUp = (e: React.MouseEvent) => setBtns((s) => { const n = new Set(s); n.delete(e.button); return n; });

  const onMove = () => {
    const t = performance.now();
    const arr = moveTimes.current;
    arr.push(t);
    while (arr.length && t - arr[0] > 1000) arr.shift();
    if (arr.length >= 2) {
      // polling rate ≈ events/sec while the mouse is moving
      const rate = arr.length;
      setHz(rate);
      setHzMax((m) => Math.max(m, rate));
    }
  };

  const BTN = ['Left', 'Middle', 'Right', 'Back', 'Forward'];
  return (
    <div className="space-y-4">
      <div
        onMouseDown={onDown} onMouseUp={onUp} onMouseMove={onMove}
        onContextMenu={(e) => e.preventDefault()} onWheel={(e) => setScroll((s) => s + (e.deltaY > 0 ? 1 : -1))}
        className="grid h-64 select-none place-items-center border border-black/[0.08] bg-[var(--color-surface-1)] text-center">
        <div>
          <div className="text-[13px] font-semibold text-[var(--color-fg-muted)]">Move, click, and scroll inside this box</div>
          <div className="mt-2 text-[34px] font-extrabold tabular-nums text-[var(--color-cat-test)]">{hz} Hz</div>
          <div className="text-[11px] text-[var(--color-fg-subtle)]">live polling estimate while moving · peak {hzMax} Hz</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {BTN.map((b, i) => (
          <div key={i} className={`flex-1 rounded border px-2 py-2 text-center text-[12px] font-semibold transition-colors ${btns.has(i) ? 'border-[var(--color-cat-test)] bg-[var(--color-cat-test)] text-white' : seen.has(i) ? 'border-[var(--color-cat-test)]/40 bg-[var(--color-cat-test)]/10' : 'border-black/[0.1] text-[var(--color-fg-muted)]'}`}>{b}</div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <Stat label="Scroll ticks" value={scroll} />
        <Stat label="Double-click" value={dblMs != null ? `${dblMs} ms` : '—'} />
        <button type="button" onClick={() => { setSeen(new Set()); setScroll(0); setDblMs(null); setHzMax(0); }} className="ml-auto border border-black/[0.12] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]">Reset</button>
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Polling rate is an estimate from browser mouse events (the OS caps these to ~the display rate in some browsers, so high-Hz mice may read lower than their spec).</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (<div><div className="text-[20px] font-bold tabular-nums tracking-tight">{value}</div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div></div>);
}
