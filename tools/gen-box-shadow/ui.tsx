'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Plus, X } from 'lucide-react';
import { CopyButton } from '@/components/tool/CopyButton';

interface Layer {
  id: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  alpha: number;
  inset: boolean;
}

let _nextId = 1;
const newLayer = (overrides: Partial<Layer> = {}): Layer => ({ id: _nextId++, x: 0, y: 8, blur: 16, spread: 0, color: '#000000', alpha: 0.25, inset: false, ...overrides });

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const PRESETS: { label: string; layers: Partial<Layer>[] }[] = [
  { label: 'Subtle',   layers: [{ x: 0, y: 1, blur: 2, spread: 0, alpha: 0.1 }] },
  { label: 'Soft',     layers: [{ x: 0, y: 4, blur: 12, spread: 0, alpha: 0.15 }] },
  { label: 'Card',     layers: [{ x: 0, y: 10, blur: 25, spread: -5, alpha: 0.1 }, { x: 0, y: 8, blur: 10, spread: -6, alpha: 0.06 }] },
  { label: 'Float',    layers: [{ x: 0, y: 20, blur: 40, spread: -10, alpha: 0.2 }] },
  { label: 'Neon',     layers: [{ x: 0, y: 0, blur: 20, spread: 2, color: '#7b9acc', alpha: 0.9 }] },
  { label: 'Inset',    layers: [{ x: 0, y: 2, blur: 8, spread: 0, alpha: 0.2, inset: true }] },
];

export default function Tool() {
  const [layers, setLayers] = React.useState<Layer[]>([newLayer()]);
  const [bgColor, setBgColor] = React.useState('#f4f1ed');
  const [boxColor, setBoxColor] = React.useState('#ffffff');
  const [radius, setRadius] = React.useState(12);

  const cssValue = layers.map((l) => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${hexToRgba(l.color, l.alpha)}`).join(', ');

  const addLayer = () => { if (layers.length < 4) setLayers([...layers, newLayer({ y: 16, alpha: 0.15 })]); };
  const removeLayer = (id: number) => setLayers(layers.filter((l) => l.id !== id));
  const updateLayer = (id: number, patch: Partial<Layer>) => setLayers(layers.map((l) => l.id === id ? { ...l, ...patch } : l));

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setLayers(preset.layers.map((p) => newLayer(p)));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <div className="border border-black/[0.08] p-12 flex items-center justify-center min-h-[320px]" style={{ background: bgColor }}>
            <div style={{ width: 200, height: 200, background: boxColor, borderRadius: radius, boxShadow: cssValue }} />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => applyPreset(p)}
                className="border border-black/[0.08] py-2 text-[11px] font-bold hover:border-[var(--color-cat-gen)]">
                {p.label}
              </button>
            ))}
          </div>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] tabular-nums break-all">
            box-shadow: {cssValue};
          </div>
          <CopyButton value={`box-shadow: ${cssValue};`} className="w-full" />
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Box</span>
                <input type="color" value={boxColor} onChange={(e) => setBoxColor(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">BG</span>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Radius</span>
                <input type="number" value={radius} min={0} max={100} onChange={(e) => setRadius(Number(e.target.value))}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-0.5 font-mono text-[12px] outline-none focus:border-[var(--color-cat-gen)]" />
              </label>
            </div>
          </div>

          {layers.map((l, i) => (
            <div key={l.id} className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Layer {i + 1}</span>
                {layers.length > 1 && (
                  <button type="button" onClick={() => removeLayer(l.id)} className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
              {(['x', 'y', 'blur', 'spread'] as const).map((k) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]">{k}</span>
                    <span className="font-mono text-[11px] tabular-nums">{l[k]}px</span>
                  </div>
                  <Slider.Root value={[l[k]]} min={k === 'spread' ? -30 : k === 'blur' ? 0 : -50} max={k === 'blur' ? 100 : 50} step={1}
                    onValueChange={([v]) => updateLayer(l.id, { [k]: v })}
                    className="relative mt-1 flex h-4 w-full touch-none items-center">
                    <Slider.Track className="relative h-1 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-gen)]" /></Slider.Track>
                    <Slider.Thumb className="block h-3 w-3 border border-[var(--color-fg)] bg-[var(--color-cat-gen)]" />
                  </Slider.Root>
                </div>
              ))}
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <label className="flex flex-col items-center">
                  <span className="text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]">Color</span>
                  <input type="color" value={l.color} onChange={(e) => updateLayer(l.id, { color: e.target.value })} className="mt-1 h-7 w-9 cursor-pointer border-0 bg-transparent" />
                </label>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]">Alpha</span>
                    <span className="font-mono text-[11px] tabular-nums">{Math.round(l.alpha * 100)}%</span>
                  </div>
                  <Slider.Root value={[l.alpha]} min={0} max={1} step={0.05}
                    onValueChange={([v]) => updateLayer(l.id, { alpha: v })}
                    className="relative mt-1 flex h-4 w-full touch-none items-center">
                    <Slider.Track className="relative h-1 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-gen)]" /></Slider.Track>
                    <Slider.Thumb className="block h-3 w-3 border border-[var(--color-fg)] bg-[var(--color-cat-gen)]" />
                  </Slider.Root>
                </div>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={l.inset} onChange={(e) => updateLayer(l.id, { inset: e.target.checked })}
                    className="h-3.5 w-3.5 accent-[var(--color-cat-gen)]" />
                  <span className="text-[10px] font-semibold">inset</span>
                </label>
              </div>
            </div>
          ))}

          {layers.length < 4 && (
            <button type="button" onClick={addLayer}
              className="w-full border border-dashed border-black/[0.18] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:border-[var(--color-cat-gen)] hover:text-[var(--color-fg)]">
              <Plus className="inline h-3.5 w-3.5 mr-1" />Add layer
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
