'use client';
import * as React from 'react';
import { Check, X } from 'lucide-react';
import { parseHex, contrast } from '@/engines/color';
import { cn } from '@/lib/cn';

function verdict(ratio: number, level: 'AA' | 'AAA', size: 'normal' | 'large'): boolean {
  if (level === 'AA') return size === 'large' ? ratio >= 3 : ratio >= 4.5;
  return size === 'large' ? ratio >= 4.5 : ratio >= 7;
}

export default function Tool() {
  const [fg, setFg] = React.useState('#0a0a0a');
  const [bg, setBg] = React.useState('#fff8e7');
  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  const ratio = fgRgb && bgRgb ? contrast(fgRgb, bgRgb) : 0;

  const tests = [
    { label: 'Normal text · AA',  pass: verdict(ratio, 'AA',  'normal'), needed: '4.5:1' },
    { label: 'Normal text · AAA', pass: verdict(ratio, 'AAA', 'normal'), needed: '7:1' },
    { label: 'Large text · AA',   pass: verdict(ratio, 'AA',  'large'),  needed: '3:1' },
    { label: 'Large text · AAA',  pass: verdict(ratio, 'AAA', 'large'),  needed: '4.5:1' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="border border-black/[0.08] p-10" style={{ background: bg, color: fg }}>
        <div className="text-[42px] font-bold tracking-tight">The quick brown fox</div>
        <div className="mt-2 text-[18px]">jumps over the lazy dog</div>
        <div className="mt-3 text-[14px]">Body text at a comfortable reading size — verify legibility.</div>
        <div className="mt-6 inline-block border px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider" style={{ borderColor: fg }}>
          Button label
        </div>
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Contrast ratio</div>
          <div className="mt-1 font-mono text-[58px] font-bold tabular-nums text-[var(--color-cat-generator)]">
            {ratio.toFixed(2)}
          </div>
          <div className="text-[11px] text-[var(--color-fg-subtle)]">out of 21:1</div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <input type="text" value={fg} onChange={(e) => setFg(e.target.value)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
            <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">FG</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <input type="text" value={bg} onChange={(e) => setBg(e.target.value)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
            <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">BG</span>
          </div>
          <button
            type="button"
            onClick={() => { setFg(bg); setBg(fg); }}
            className="w-full border border-black/[0.08] py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            Swap
          </button>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          {tests.map((t) => (
            <div key={t.label} className="flex items-center justify-between border-b border-black/[0.05] px-4 py-2.5 last:border-0">
              <div>
                <div className="text-[12px] font-semibold text-[var(--color-fg)]">{t.label}</div>
                <div className="text-[10px] text-[var(--color-fg-subtle)]">needs ≥ {t.needed}</div>
              </div>
              <span className={cn(
                'grid h-7 w-7 place-items-center',
                t.pass ? 'bg-[oklch(62%_0.16_150)] text-white' : 'bg-[oklch(58%_0.22_22)] text-white',
              )}>
                {t.pass ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
