'use client';
import * as React from 'react';
import { Copy, Check, Plus, X } from 'lucide-react';

const DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'] as const;
const WRAPS = ['nowrap', 'wrap', 'wrap-reverse'] as const;
const JUSTIFIES = ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'] as const;
const ALIGNS = ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'] as const;
const CONTENTS = ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around'] as const;

type Dir = typeof DIRECTIONS[number];
type Wrap = typeof WRAPS[number];
type J = typeof JUSTIFIES[number];
type A = typeof ALIGNS[number];
type C = typeof CONTENTS[number];

export default function Tool() {
  const [dir, setDir] = React.useState<Dir>('row');
  const [wrap, setWrap] = React.useState<Wrap>('nowrap');
  const [justify, setJustify] = React.useState<J>('flex-start');
  const [align, setAlign] = React.useState<A>('stretch');
  const [content, setContent] = React.useState<C>('stretch');
  const [gap, setGap] = React.useState(8);
  const [count, setCount] = React.useState(5);
  const [copied, setCopied] = React.useState(false);

  const css = `display: flex;
flex-direction: ${dir};
flex-wrap: ${wrap};
justify-content: ${justify};
align-items: ${align};
align-content: ${content};
gap: ${gap}px;`;

  const copy = async () => {
    await navigator.clipboard?.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const Pill = <T extends string>({ value, opts, onChange, label }: { value: T; opts: readonly T[]; onChange: (v: T) => void; label: string }) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`border px-2 py-1.5 text-[10px] font-bold transition ${value === o ? 'border-[var(--color-cat-gen)] bg-[var(--color-cat-gen)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 min-h-[320px]"
            style={{ display: 'flex', flexDirection: dir, flexWrap: wrap, justifyContent: justify, alignItems: align, alignContent: content, gap: `${gap}px` }}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="bg-[var(--color-cat-gen)] text-white font-mono text-[12px] font-bold flex items-center justify-center"
                style={{ minWidth: 48, minHeight: 48, padding: '8px 12px' }}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] whitespace-pre">{css}</div>
          <button type="button" onClick={copy}
            className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] text-[var(--color-bg)] py-2.5 text-[12px] font-bold uppercase tracking-wider">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy CSS</>}
          </button>
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-3">
            <Pill value={dir} opts={DIRECTIONS} onChange={setDir} label="flex-direction" />
            <Pill value={wrap} opts={WRAPS} onChange={setWrap} label="flex-wrap" />
            <Pill value={justify} opts={JUSTIFIES} onChange={setJustify} label="justify-content" />
            <Pill value={align} opts={ALIGNS} onChange={setAlign} label="align-items" />
            <Pill value={content} opts={CONTENTS} onChange={setContent} label="align-content" />
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">gap</span>
                <span className="font-mono text-[12px] tabular-nums">{gap}px</span>
              </div>
              <input type="range" min={0} max={64} step={1} value={gap} onChange={(e) => setGap(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-cat-gen)]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">items</span>
              <button type="button" onClick={() => setCount(Math.max(1, count - 1))}
                className="border border-black/[0.08] px-2 py-1 text-[11px] hover:border-[var(--color-cat-gen)]"><X className="h-3.5 w-3.5" /></button>
              <span className="font-mono text-[12px] font-bold w-6 text-center">{count}</span>
              <button type="button" onClick={() => setCount(Math.min(20, count + 1))}
                className="border border-black/[0.08] px-2 py-1 text-[11px] hover:border-[var(--color-cat-gen)]"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
