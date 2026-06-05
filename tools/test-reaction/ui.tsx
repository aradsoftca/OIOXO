'use client';
import * as React from 'react';

type Phase = 'idle' | 'waiting' | 'now' | 'result' | 'tooSoon';

export default function ReactionTest() {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [ms, setMs] = React.useState(0);
  const [tries, setTries] = React.useState<number[]>([]);
  const startRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const arm = () => {
    setPhase('waiting');
    const delay = 1200 + Math.random() * 2800;
    timerRef.current = setTimeout(() => { startRef.current = performance.now(); setPhase('now'); }, delay);
  };

  const click = () => {
    if (phase === 'idle' || phase === 'result' || phase === 'tooSoon') { arm(); return; }
    if (phase === 'waiting') { if (timerRef.current) clearTimeout(timerRef.current); setPhase('tooSoon'); return; }
    if (phase === 'now') {
      const t = Math.round(performance.now() - startRef.current);
      setMs(t); setTries((a) => [...a, t]); setPhase('result');
    }
  };

  const best = tries.length ? Math.min(...tries) : 0;
  const avg = tries.length ? Math.round(tries.reduce((a, b) => a + b, 0) / tries.length) : 0;

  const bg = phase === 'now' ? 'bg-green-500' : phase === 'waiting' ? 'bg-red-500' : phase === 'tooSoon' ? 'bg-amber-500' : 'bg-[var(--color-cat-test)]';
  const msg = phase === 'idle' ? 'Click to start' : phase === 'waiting' ? 'Wait for green…' : phase === 'now' ? 'CLICK!' : phase === 'tooSoon' ? 'Too soon! Click to retry' : `${ms} ms · click to go again`;

  return (
    <div className="space-y-4">
      <button type="button" onClick={click}
        className={`flex h-72 w-full select-none flex-col items-center justify-center text-white transition-colors ${bg}`}>
        <span className="text-[28px] font-extrabold tracking-tight">{msg}</span>
        {phase === 'now' && <span className="mt-1 text-[13px] opacity-80">as fast as you can</span>}
      </button>
      {tries.length > 0 && (
        <div className="flex flex-wrap items-center gap-6">
          <Stat label="Last" value={`${ms} ms`} big />
          <Stat label="Best" value={`${best} ms`} />
          <Stat label="Average" value={`${avg} ms`} />
          <Stat label="Tries" value={tries.length} />
          <button type="button" onClick={() => setTries([])} className="ml-auto border border-black/[0.12] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]">Reset</button>
        </div>
      )}
    </div>
  );
}
function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (<div><div className={`tabular-nums font-bold tracking-tight ${big ? 'text-[30px] text-[var(--color-cat-test)]' : 'text-[20px]'}`}>{value}</div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div></div>);
}
