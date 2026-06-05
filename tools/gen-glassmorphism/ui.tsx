'use client';
import * as React from 'react';
import { CopyButton } from '@/components/tool/CopyButton';

const BG_PRESETS = [
  { id: 'sunset',  gradient: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)' },
  { id: 'aurora',  gradient: 'linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)' },
  { id: 'cosmic',  gradient: 'linear-gradient(135deg, #6e3bbc 0%, #f78ec0 100%)' },
  { id: 'ocean',   gradient: 'linear-gradient(135deg, #2e3192 0%, #1bffff 100%)' },
  { id: 'forest',  gradient: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { id: 'rose',    gradient: 'linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)' },
];

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

export default function Tool() {
  const [bg, setBg] = React.useState(BG_PRESETS[2]);
  const [blur, setBlur] = React.useState(16);
  const [alpha, setAlpha] = React.useState(0.18);
  const [tint, setTint] = React.useState('#ffffff');
  const [borderAlpha, setBorderAlpha] = React.useState(0.3);
  const [radius, setRadius] = React.useState(20);

  const css = `background: ${hexToRgba(tint, alpha)};
backdrop-filter: blur(${blur}px);
-webkit-backdrop-filter: blur(${blur}px);
border: 1px solid ${hexToRgba(tint, borderAlpha)};
border-radius: ${radius}px;
box-shadow: 0 8px 32px rgba(0,0,0,0.18);`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <div className="relative border border-black/[0.08] p-12 flex items-center justify-center min-h-[360px]" style={{ background: bg.gradient }}>
            <div className="w-[320px] h-[200px] flex items-center justify-center font-bold text-white text-[18px]"
              style={{
                background: hexToRgba(tint, alpha),
                backdropFilter: `blur(${blur}px)`,
                WebkitBackdropFilter: `blur(${blur}px)`,
                border: `1px solid ${hexToRgba(tint, borderAlpha)}`,
                borderRadius: radius,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              }}>
              Frosted Glass
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {BG_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => setBg(p)} title={p.id}
                style={{ background: p.gradient }}
                className={`h-10 border ${bg.id === p.id ? 'border-[var(--color-fg)] border-2' : 'border-black/[0.08]'}`} />
            ))}
          </div>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] whitespace-pre">{css}</div>
          <CopyButton value={css} />
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-3">
            <SliderField label="Blur" value={blur} min={0} max={40} step={1} unit="px" onChange={setBlur} />
            <SliderField label="Tint opacity" value={alpha} min={0} max={1} step={0.02} unit="" onChange={setAlpha} fmt={(v) => `${Math.round(v * 100)}%`} />
            <SliderField label="Border opacity" value={borderAlpha} min={0} max={1} step={0.05} unit="" onChange={setBorderAlpha} fmt={(v) => `${Math.round(v * 100)}%`} />
            <SliderField label="Radius" value={radius} min={0} max={60} step={1} unit="px" onChange={setRadius} />
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Tint color</span>
              <input type="color" value={tint} onChange={(e) => setTint(e.target.value)}
                className="mt-1 h-9 w-full cursor-pointer border-0 bg-transparent" />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SliderField({ label, value, min, max, step, unit, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
        <span className="font-mono text-[11px] tabular-nums">{fmt ? fmt(value) : `${value}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-cat-gen)]" />
    </div>
  );
}
