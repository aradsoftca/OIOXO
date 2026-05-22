'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { parseHex, rgbToHsl, rgbToHsv, toHex } from '@/engines/color';
import { cn } from '@/lib/cn';

export default function Tool() {
  const [hex, setHex] = React.useState('#3a4a5a');
  const [copied, setCopied] = React.useState<string | null>(null);
  const rgb = parseHex(hex);
  const hsl = rgb ? rgbToHsl(rgb) : null;
  const hsv = rgb ? rgbToHsv(rgb) : null;

  const formats = rgb && hsl && hsv ? [
    { label: 'HEX', value: toHex(rgb).toUpperCase() },
    { label: 'RGB',  value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: 'RGB %', value: `rgb(${(rgb.r/255*100).toFixed(1)}%, ${(rgb.g/255*100).toFixed(1)}%, ${(rgb.b/255*100).toFixed(1)}%)` },
    { label: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
    { label: 'HSV', value: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)` },
    { label: 'CMYK', value: rgbToCmyk(rgb) },
    { label: 'Tailwind nearest', value: nearestTailwind(rgb) },
  ] : [];

  const copy = async (v: string) => {
    await navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="aspect-square border border-black/[0.08]" style={{ background: hex }} />

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Color</div>
          <div className="mt-2 flex items-center gap-2">
            <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-12 w-12 cursor-pointer border border-black/[0.08]" />
            <input type="text" value={hex} onChange={(e) => setHex(e.target.value)} className="flex-1 border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[16px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-generator)]" />
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          {formats.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => copy(f.value)}
              className="group flex w-full items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-2.5 text-left transition last:border-0 hover:bg-[var(--color-surface-2)]"
            >
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{f.label}</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold text-[var(--color-fg)]">{f.value}</div>
              </div>
              <span className={cn('opacity-0 transition group-hover:opacity-100', copied === f.value && 'opacity-100')}>
                {copied === f.value
                  ? <Check className="h-4 w-4 text-[var(--color-cat-generator)]" />
                  : <Copy className="h-4 w-4 text-[var(--color-fg-subtle)]" />}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function rgbToCmyk({ r, g, b }: { r: number; g: number; b: number }): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return 'cmyk(0%, 0%, 0%, 100%)';
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return `cmyk(${(c * 100).toFixed(0)}%, ${(m * 100).toFixed(0)}%, ${(y * 100).toFixed(0)}%, ${(k * 100).toFixed(0)}%)`;
}

const TAILWIND_BASE: Array<[string, string]> = [
  ['slate-500', '#64748b'], ['gray-500', '#6b7280'], ['zinc-500', '#71717a'],
  ['stone-500', '#78716c'], ['red-500', '#ef4444'], ['orange-500', '#f97316'],
  ['amber-500', '#f59e0b'], ['yellow-500', '#eab308'], ['lime-500', '#84cc16'],
  ['green-500', '#22c55e'], ['emerald-500', '#10b981'], ['teal-500', '#14b8a6'],
  ['cyan-500', '#06b6d4'], ['sky-500', '#0ea5e9'], ['blue-500', '#3b82f6'],
  ['indigo-500', '#6366f1'], ['violet-500', '#8b5cf6'], ['purple-500', '#a855f7'],
  ['fuchsia-500', '#d946ef'], ['pink-500', '#ec4899'], ['rose-500', '#f43f5e'],
];

function nearestTailwind({ r, g, b }: { r: number; g: number; b: number }): string {
  let best = TAILWIND_BASE[0];
  let bestD = Infinity;
  for (const [name, hex] of TAILWIND_BASE) {
    const p = parseHex(hex);
    if (!p) continue;
    const d = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
    if (d < bestD) { bestD = d; best = [name, hex]; }
  }
  return best[0];
}
