'use client';
import * as React from 'react';

interface Snap { id: string; buttons: number[]; axes: number[] }

export default function GamepadTest() {
  const [pads, setPads] = React.useState<Snap[]>([]);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const loop = () => {
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      const snaps: Snap[] = [];
      for (const gp of list) {
        if (!gp) continue;
        snaps.push({ id: gp.id, buttons: gp.buttons.map((b) => b.value), axes: gp.axes.slice() });
      }
      setPads(snaps);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const vibrate = (idx: number) => {
    const gp = (navigator.getGamepads?.() || [])[idx] as (Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => void } }) | null;
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 600, strongMagnitude: 1, weakMagnitude: 1 });
  };

  if (!pads.length) {
    return (
      <div className="grid h-56 place-items-center border border-dashed border-black/[0.14] bg-[var(--color-surface-1)] text-center">
        <div>
          <div className="text-[15px] font-semibold">No controller detected</div>
          <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">Connect a controller and press any button to wake it.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {pads.map((p, pi) => (
        <div key={pi} className="space-y-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-[12px] font-semibold">{p.id}</span>
            <button type="button" onClick={() => vibrate(pi)} className="border border-black/[0.12] px-3 py-1.5 text-[11px] font-semibold hover:bg-[var(--color-surface-2)]">Vibrate</button>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Buttons</div>
            <div className="flex flex-wrap gap-1.5">
              {p.buttons.map((v, i) => (
                <div key={i} className="grid h-9 w-9 place-items-center rounded text-[10px] font-bold tabular-nums transition-colors"
                  style={{ background: v > 0.05 ? 'var(--color-cat-test)' : 'rgba(0,0,0,0.06)', color: v > 0.05 ? '#fff' : 'inherit' }}>{i}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Sticks / triggers</div>
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: Math.floor(p.axes.length / 2) }).map((_, i) => {
                const x = p.axes[i * 2] ?? 0, y = p.axes[i * 2 + 1] ?? 0;
                return (
                  <div key={i} className="relative h-20 w-20 rounded-full border border-black/[0.12]">
                    <div className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-cat-test)]"
                      style={{ left: `${50 + x * 45}%`, top: `${50 + y * 45}%` }} />
                  </div>
                );
              })}
              {p.axes.map((a, i) => <div key={`a${i}`} className="font-mono text-[10px] text-[var(--color-fg-muted)]">a{i}: {a.toFixed(2)}</div>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
