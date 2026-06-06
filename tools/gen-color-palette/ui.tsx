'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { parseHex, toHex, rgbToHsl, hslToRgb, harmonies } from '@/engines/color';
import { cn } from '@/lib/cn';
import { useCopy } from '@/components/tool/CopyButton';

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
  const { copy, isCopied } = useCopy();

  const rgb = parseHex(base);
  const harmonySet = rgb ? harmonies(rgbToHsl(rgb)) : null;
  const colors = harmonySet ? harmonySet[scheme] : [];
  const hexes = colors.map((c) => toHex(hslToRgb(c)));

  // 9-step shade/tint ramp of the base (Tailwind-ish 50..900) — a signature
  // palette-tool feature the harmonies alone didn't cover.
  const shades = React.useMemo(() => {
    if (!rgb) return [] as string[];
    const h = rgbToHsl(rgb);
    return [92, 82, 70, 58, 47, 38, 30, 22, 14].map((l) => toHex(hslToRgb({ h: h.h, s: h.s, l })));
  }, [rgb]);

  const randomize = () => {
    const r = () => Math.floor(Math.random() * 256);
    setBase(toHex({ r: r(), g: r(), b: r() }));
  };

  const copyCss = () => {
    const lines = hexes.map((hex, i) => `  --color-${i + 1}: ${hex};`);
    copy(`:root {\n${lines.join('\n')}\n}`);
  };

  const exportPng = () => {
    const sw = 200, h = 200;
    const canvas = document.createElement('canvas');
    canvas.width = sw * hexes.length; canvas.height = h;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    hexes.forEach((hex, i) => {
      ctx.fillStyle = hex; ctx.fillRect(i * sw, 0, sw, h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
      ctx.fillText(hex.toUpperCase(), i * sw + sw / 2, h - 20);
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = 'palette.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button type="button" onClick={randomize} className="border border-black/[0.1] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-[var(--color-surface-2)]">Random</button>
            <button type="button" onClick={copyCss} className="border border-black/[0.1] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-[var(--color-surface-2)]">Copy CSS</button>
            <button type="button" onClick={exportPng} className="border border-black/[0.1] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-[var(--color-surface-2)]">Export PNG</button>
          </div>
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
                <div className={cn('mt-2 opacity-0 transition group-hover:opacity-100', isCopied(hex) && 'opacity-100')}>
                  {isCopied(hex)
                    ? <Check className="h-4 w-4" />
                    : <Copy className="h-4 w-4" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {shades.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">Shades &amp; tints of base</div>
          <div className="flex overflow-hidden border border-black/[0.08]">
            {shades.map((hex, i) => (
              <button key={i} type="button" onClick={() => copy(hex)} title={hex}
                className="group relative h-12 flex-1" style={{ background: hex }}>
                <span className={cn('absolute inset-x-0 bottom-0.5 text-center font-mono text-[9px] opacity-0 transition group-hover:opacity-100', i > 4 ? 'text-white/90' : 'text-black/70')}>
                  {isCopied(hex) ? '✓' : hex}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
