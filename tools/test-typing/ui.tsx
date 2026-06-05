'use client';
import * as React from 'react';
import { RotateCcw } from 'lucide-react';

const PASSAGES = [
  'The quick brown fox jumps over the lazy dog while the sun sets behind the quiet hills.',
  'Practice makes progress, not perfection, so keep your hands steady and your eyes ahead.',
  'A smooth sea never made a skilled sailor, and easy keystrokes never built fast fingers.',
];

export default function TypingTest() {
  const [target, setTarget] = React.useState(PASSAGES[0]);
  const [input, setInput] = React.useState('');
  const [start, setStart] = React.useState<number | null>(null);
  const [end, setEnd] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(0);
  const done = end != null;
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Live timer tick while typing (not finished).
  React.useEffect(() => {
    if (start == null || done) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [start, done]);

  const reset = (next = false) => {
    setTarget(next ? PASSAGES[Math.floor(Math.random() * PASSAGES.length)] : target);
    setInput(''); setStart(null); setEnd(null); setNow(0); taRef.current?.focus();
  };

  const onChange = (v: string) => {
    if (done) return;
    if (start == null) setStart(performance.now());
    setInput(v);
    if (v.length >= target.length) setEnd(performance.now());
  };

  const elapsed = start != null ? ((end ?? now ?? performance.now()) - start) / 1000 : 0;

  const correct = input.split('').filter((c, i) => c === target[i]).length;
  const accuracy = input.length ? Math.round((correct / input.length) * 100) : 100;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const wpm = elapsed > 0 ? Math.round((words / elapsed) * 60) : 0;

  return (
    <div className="space-y-4">
      <div className="select-none border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[16px] leading-relaxed font-mono">
        {target.split('').map((ch, i) => {
          const typed = input[i];
          const cls = typed == null ? 'text-[var(--color-fg-muted)]' : typed === ch ? 'text-green-600' : 'bg-red-500/20 text-red-600';
          return <span key={i} className={cls}>{ch}</span>;
        })}
      </div>
      <textarea ref={taRef} value={input} onChange={(e) => onChange(e.target.value)} disabled={done} autoFocus rows={3}
        placeholder="Start typing here…" className="w-full resize-none border border-black/[0.1] bg-[var(--color-surface-1)] p-3 font-mono text-[15px] outline-none focus:border-[var(--color-cat-test)]" />
      <div className="flex flex-wrap items-center gap-6">
        <Stat label="WPM" value={wpm} big />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Stat label="Time" value={`${elapsed.toFixed(1)}s`} />
        <button type="button" onClick={() => reset(true)} className="ml-auto flex items-center gap-2 border border-black/[0.12] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]">
          <RotateCcw className="h-3.5 w-3.5" /> New passage
        </button>
      </div>
      {done && <div className="border border-[var(--color-cat-test)]/40 bg-[var(--color-cat-test)]/5 p-3 text-[13px] font-semibold">Done — {wpm} WPM at {accuracy}% accuracy.</div>}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div>
      <div className={`tabular-nums font-bold tracking-tight ${big ? 'text-[34px] text-[var(--color-cat-test)]' : 'text-[22px]'}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div>
    </div>
  );
}
