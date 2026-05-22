'use client';
import * as React from 'react';
import { diffLines, diffWords } from 'diff';
import { cn } from '@/lib/cn';

export default function Tool() {
  const [left, setLeft] = React.useState('');
  const [right, setRight] = React.useState('');
  const [mode, setMode] = React.useState<'line' | 'word'>('line');

  const parts = React.useMemo(() => {
    if (mode === 'line') return diffLines(left, right);
    return diffWords(left, right);
  }, [left, right, mode]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['line', 'word'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition',
                mode === m
                  ? 'border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)]',
              )}
            >
              {m} diff
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[var(--color-fg-subtle)]">
          + added · − removed
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
          <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Original</div>
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="Paste the original text…"
            spellCheck={false}
            className="h-72 w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-[var(--color-fg)] focus:outline-none"
          />
        </div>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
          <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Changed</div>
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            placeholder="Paste the changed text…"
            spellCheck={false}
            className="h-72 w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-[var(--color-fg)] focus:outline-none"
          />
        </div>
      </div>

      <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
        <div className="border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          Diff
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[12.5px] leading-relaxed">
          {parts.map((p, i) => (
            <span
              key={i}
              className={
                p.added
                  ? 'bg-green-200/35 text-green-900'
                  : p.removed
                    ? 'bg-red-200/35 text-red-900 line-through decoration-1'
                    : 'text-[var(--color-fg-muted)]'
              }
            >
              {p.value}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
