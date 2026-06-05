'use client';
import * as React from 'react';

interface Pt { id: number; x: number; y: number }
const COLORS = ['#06b6d4', '#f43f5e', '#84cc16', '#a855f7', '#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#ef4444', '#8b5cf6'];

export default function TouchTest() {
  const [pts, setPts] = React.useState<Pt[]>([]);
  const [maxN, setMaxN] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const update = (e: React.TouchEvent) => {
    e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    const next: Pt[] = Array.from(e.touches).map((t) => ({ id: t.identifier, x: t.clientX - r.left, y: t.clientY - r.top }));
    setPts(next);
    setMaxN((m) => Math.max(m, next.length));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6">
        <Stat label="Touches now" value={pts.length} />
        <Stat label="Max at once" value={maxN} />
        <button type="button" onClick={() => setMaxN(0)} className="ml-auto border border-black/[0.12] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]">Reset</button>
      </div>
      <div
        ref={ref}
        onTouchStart={update} onTouchMove={update} onTouchEnd={update} onTouchCancel={update}
        className="relative h-80 w-full touch-none select-none overflow-hidden border border-black/[0.08] bg-[var(--color-surface-1)]"
      >
        {pts.length === 0 && <div className="grid h-full place-items-center text-[13px] text-[var(--color-fg-muted)]">Touch here with one or more fingers</div>}
        {pts.map((p, i) => (
          <div key={p.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
            style={{ left: p.x, top: p.y, width: 70, height: 70, background: COLORS[i % COLORS.length] }}>
            <span className="grid h-full w-full place-items-center text-[12px] font-bold text-white">{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">On a desktop without a touchscreen this stays empty — open it on a phone or tablet.</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (<div><div className="text-[24px] font-bold tabular-nums tracking-tight text-[var(--color-cat-test)]">{value}</div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div></div>);
}
