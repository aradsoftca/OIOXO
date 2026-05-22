'use client';

import * as React from 'react';
import { Copy, Check, Plus, X } from 'lucide-react';

interface Layer { id: number; x: number; y: number; blur: number; color: string; alpha: number; }
let _id = 1;
const newLayer = (o: Partial<Layer> = {}): Layer => ({ id: _id++, x: 2, y: 2, blur: 4, color: '#000000', alpha: 0.5, ...o });

function rgba(hex: string, a: number) {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return `rgba(0,0,0,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
const ACCENT = 'var(--color-cat-generator)';

const PRESETS: { label: string; layers: Partial<Layer>[] }[] = [
  { label: 'Soft',  layers: [{ x: 1, y: 1, blur: 3, alpha: 0.4 }] },
  { label: 'Hard',  layers: [{ x: 3, y: 3, blur: 0, alpha: 0.8 }] },
  { label: 'Glow',  layers: [{ x: 0, y: 0, blur: 12, color: '#4d96ff', alpha: 0.9 }] },
  { label: 'Neon',  layers: [{ x: 0, y: 0, blur: 6, color: '#ff2bd1', alpha: 1 }, { x: 0, y: 0, blur: 18, color: '#ff2bd1', alpha: 0.8 }] },
  { label: '3D',    layers: [{ x: 1, y: 1, blur: 0, alpha: 0.3 }, { x: 2, y: 2, blur: 0, alpha: 0.25 }, { x: 3, y: 3, blur: 0, alpha: 0.2 }] },
];

export default function Tool() {
  const [layers, setLayers] = React.useState<Layer[]>([newLayer()]);
  const [text, setText] = React.useState('Xonvert');
  const [textColor, setTextColor] = React.useState('#1a1a1a');
  const [bg, setBg] = React.useState('#f4f1ed');
  const [copied, setCopied] = React.useState(false);

  const css = layers.map((l) => `${l.x}px ${l.y}px ${l.blur}px ${rgba(l.color, l.alpha)}`).join(', ');
  const upd = (id: number, p: Partial<Layer>) => setLayers((ls) => ls.map((l) => l.id === id ? { ...l, ...p } : l));
  const copy = async () => { await navigator.clipboard?.writeText(`text-shadow: ${css};`); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        <div className="grid min-h-[320px] place-items-center border border-black/[0.08] p-6" style={{ background: bg }}>
          <div className="text-center text-[clamp(28px,7vw,64px)] font-extrabold" style={{ color: textColor, textShadow: css }}>{text || 'Preview'}</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setLayers(p.layers.map((x) => newLayer(x)))}
              className="border border-black/[0.08] py-2 text-[11px] font-bold hover:border-[var(--color-cat-generator)]">{p.label}</button>
          ))}
        </div>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] break-all">text-shadow: {css};</div>
        <button type="button" onClick={copy}
          className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90">
          {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy CSS</>}
        </button>
      </div>

      <aside className="space-y-3">
        <div className="grid grid-cols-3 gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <label className="col-span-3 flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Text</span>
            <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 border-b border-black/[0.1] bg-transparent py-0.5 text-[13px] outline-none focus:border-[var(--color-cat-generator)]" />
          </label>
          <label className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Color</span>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">BG</span>
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" /></label>
        </div>

        {layers.map((l, i) => (
          <div key={l.id} className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Layer {i + 1}</span>
              {layers.length > 1 && <button type="button" onClick={() => setLayers((ls) => ls.filter((x) => x.id !== l.id))} className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><X className="h-3.5 w-3.5" /></button>}
            </div>
            {(['x', 'y', 'blur'] as const).map((k) => (
              <div key={k}>
                <div className="flex items-baseline justify-between"><span className="text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]">{k}</span><span className="font-mono text-[11px] tabular-nums">{l[k]}px</span></div>
                <input type="range" min={k === 'blur' ? 0 : -30} max={k === 'blur' ? 40 : 30} value={l[k]} onChange={(e) => upd(l.id, { [k]: Number(e.target.value) })} className="mt-1 w-full" style={{ accentColor: ACCENT }} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="color" value={l.color} onChange={(e) => upd(l.id, { color: e.target.value })} className="h-7 w-9 cursor-pointer border-0 bg-transparent" />
              <div className="flex-1">
                <div className="flex items-baseline justify-between"><span className="text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]">Alpha</span><span className="font-mono text-[11px] tabular-nums">{Math.round(l.alpha * 100)}%</span></div>
                <input type="range" min={0} max={1} step={0.05} value={l.alpha} onChange={(e) => upd(l.id, { alpha: Number(e.target.value) })} className="w-full" style={{ accentColor: ACCENT }} />
              </div>
            </div>
          </div>
        ))}
        {layers.length < 4 && (
          <button type="button" onClick={() => setLayers((ls) => [...ls, newLayer()])}
            className="w-full border border-dashed border-black/[0.18] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
            <Plus className="mr-1 inline h-3.5 w-3.5" />Add layer
          </button>
        )}
      </aside>
    </div>
  );
}
