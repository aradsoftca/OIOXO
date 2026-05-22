'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Copy, Check, Plus, X, Download } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Stop { color: string; offset: number }

export default function Tool() {
  const [type, setType] = React.useState<'linear' | 'radial'>('linear');
  const [angle, setAngle] = React.useState(135);
  const [stops, setStops] = React.useState<Stop[]>([
    { color: '#3a4a5a', offset: 0 },
    { color: '#7b9acc', offset: 100 },
  ]);
  const [copied, setCopied] = React.useState(false);

  const css = React.useMemo(() => {
    const stopStr = stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${s.offset}%`).join(', ');
    return type === 'linear'
      ? `linear-gradient(${angle}deg, ${stopStr})`
      : `radial-gradient(circle at center, ${stopStr})`;
  }, [type, angle, stops]);

  const copy = async () => {
    await navigator.clipboard?.writeText(`background: ${css};`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const downloadPng = () => {
    const c = document.createElement('canvas');
    c.width = 1920; c.height = 1080;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (type === 'linear') {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.cos(rad) * c.width;
      const dy = Math.sin(rad) * c.height;
      const g = ctx.createLinearGradient(c.width / 2 - dx / 2, c.height / 2 - dy / 2, c.width / 2 + dx / 2, c.height / 2 + dy / 2);
      stops.slice().sort((a, b) => a.offset - b.offset).forEach((s) => g.addColorStop(s.offset / 100, s.color));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) / 2);
      stops.slice().sort((a, b) => a.offset - b.offset).forEach((s) => g.addColorStop(s.offset / 100, s.color));
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, c.width, c.height);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'gradient-1920x1080.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="aspect-[16/10] border border-black/[0.08]" style={{ background: css }} />

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {(['linear', 'radial'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'border py-2 text-[11px] font-bold uppercase tracking-wider transition',
                  type === t
                    ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                    : 'border-black/[0.08] text-[var(--color-fg-muted)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {type === 'linear' && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Angle</span>
                <span className="font-mono text-[13px] tabular-nums">{angle}°</span>
              </div>
              <Slider.Root value={[angle]} min={0} max={360} step={5} onValueChange={([v]) => setAngle(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-generator)]" /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-generator)]" />
              </Slider.Root>
            </div>
          )}
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Stops</div>
            <button
              type="button"
              onClick={() => setStops((s) => [...s, { color: '#888', offset: 50 }])}
              className="grid h-6 w-6 place-items-center border border-black/[0.08] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={s.color}
                onChange={(e) => setStops((sx) => sx.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                className="h-8 w-8 cursor-pointer border border-black/[0.08]"
              />
              <input
                type="number"
                value={s.offset}
                min={0}
                max={100}
                onChange={(e) => setStops((sx) => sx.map((x, j) => j === i ? { ...x, offset: Number(e.target.value) } : x))}
                className="w-16 border border-black/[0.08] bg-transparent px-2 py-1 font-mono text-[12px] outline-none"
              />
              <span className="text-[10px] text-[var(--color-fg-subtle)]">%</span>
              <button
                type="button"
                onClick={() => setStops((sx) => sx.filter((_, j) => j !== i))}
                disabled={stops.length <= 2}
                className="ml-auto grid h-6 w-6 place-items-center text-[var(--color-fg-subtle)] disabled:opacity-30 hover:text-[var(--color-fg)]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">CSS</div>
          <div className="mt-2 break-words font-mono text-[11px] text-[var(--color-fg)]">
            background: {css};
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="flex items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy CSS
          </button>
          <button type="button" onClick={downloadPng} className="flex items-center justify-center gap-2 border border-black/[0.08] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
            <Download className="h-3.5 w-3.5" /> PNG
          </button>
        </div>
      </aside>
    </div>
  );
}
