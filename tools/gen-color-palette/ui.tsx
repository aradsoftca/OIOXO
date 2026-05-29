'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { parseHex, toHex, rgbToHsl, hslToRgb, harmonies } from '@/engines/color';
import { cn } from '@/lib/cn';

const SCHEMES: { id: keyof ReturnType<typeof harmonies>; label: string }[] = [
  { id: 'complementary', label: 'Complementary' },
  { id: 'analogous',     label: 'Analogous' },
  { id: 'triadic',       label: 'Triadic' },
  { id: 'tetradic',      label: 'Tetradic' },
  { id: 'splitComplementary', label: 'Split-comp.' },
  { id: 'monochrome',    label: 'Monochrome' },
];

export default function Tool() {
  const [base, setBase] = React.useState('#3a4a5a');
  const [scheme, setScheme] = React.useState<typeof SCHEMES[number]['id']>('triadic');
  const [copied, setCopied] = React.useState<string | null>(null);

  const rgb = parseHex(base);
  const harmonySet = rgb ? harmonies(rgbToHsl(rgb)) : null;
  const colors = harmonySet ? harmonySet[scheme] : [];

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard?.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied(null), 1400);
    } catch { /* iframe / permission denied */ }
  };

  return (
    <div className="space-y-4">
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="h-12 w-12 cursor-pointer border border-black/[0.08]"
          />
          <input
            type="text"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[18px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-generator)]"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 md:grid-cols-6">
          {SCHEMES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScheme(s.id)}
              className={cn(
                'border py-2 text-[10px] font-bold uppercase tracking-wider transition',
                scheme === s.id
                  ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {colors.map((c, i) => {
          const hex = toHex(hslToRgb(c));
          const isDark = c.l < 50;
          return (
            <button
              key={i}
              type="button"
              onClick={() => copy(hex)}
              className="group relative aspect-square overflow-hidden border border-black/[0.08]"
              style={{ background: hex }}
            >
              <div className={cn(
                'absolute inset-0 flex flex-col items-center justify-end p-3 transition',
                isDark ? 'text-white' : 'text-black',
              )}>
                <div className="font-mono text-[14px] font-bold uppercase">{hex}</div>
                <div className={cn('text-[10px] font-mono', isDark ? 'text-white/70' : 'text-black/60')}>
                  h{c.h}° s{c.s}% l{c.l}%
                </div>
                <div className="mt-2 opacity-0 transition group-hover:opacity-100">
                  {copied === hex
                    ? <Check className="h-4 w-4" />
                    : <Copy className="h-4 w-4" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
