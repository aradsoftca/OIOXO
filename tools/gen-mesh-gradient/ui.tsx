'use client';

import * as React from 'react';
import { Download, Copy, Check, RefreshCw, Plus, X } from 'lucide-react';

interface Point { x: number; y: number; color: string }

const PALETTES: string[][] = [
  ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1'],
  ['#6c5ce7', '#a29bfe', '#fd79a8', '#fab1a0'],
  ['#0abde3', '#006ba6', '#8338ec', '#3a86ff'],
  ['#f72585', '#7209b7', '#3a0ca3', '#4361ee'],
  ['#2d3436', '#636e72', '#b2bec3', '#dfe6e9'],
  ['#00b894', '#00cec9', '#0984e3', '#6c5ce7'],
];

function randomPoints(palette: string[], n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(Math.random() * 100),
    y: Math.round(Math.random() * 100),
    color: palette[i % palette.length],
  }));
}

function buildBackground(points: Point[], base: string): string {
  const layers = points.map((p) =>
    `radial-gradient(at ${p.x}% ${p.y}%, ${p.color} 0px, transparent 55%)`,
  );
  return `${layers.join(',\n    ')},\n    ${base}`;
}

export default function GenMeshGradientTool() {
  const [paletteIdx, setPaletteIdx] = React.useState(0);
  const [points, setPoints] = React.useState<Point[]>(() => randomPoints(PALETTES[0], 4));
  const [base, setBase] = React.useState('#1a1a2e');
  const [w, setW] = React.useState(1600);
  const [h, setH] = React.useState(900);
  const [copied, setCopied] = React.useState(false);

  const bg = React.useMemo(() => buildBackground(points, base), [points, base]);
  const css = `background-color: ${base};\nbackground-image:\n    ${bg.replace(`,\n    ${base}`, '')};`;

  const shuffle = () => setPoints(randomPoints(PALETTES[paletteIdx], points.length));
  const applyPalette = (i: number) => {
    setPaletteIdx(i);
    setPoints((prev) => prev.map((p, idx) => ({ ...p, color: PALETTES[i][idx % PALETTES[i].length] })));
  };
  const addPoint = () => {
    if (points.length >= 8) return;
    setPoints((prev) => [...prev, {
      x: Math.round(Math.random() * 100),
      y: Math.round(Math.random() * 100),
      color: PALETTES[paletteIdx][prev.length % PALETTES[paletteIdx].length],
    }]);
  };
  const removePoint = (i: number) => setPoints((prev) => prev.filter((_, idx) => idx !== i));
  const setPointColor = (i: number, color: string) => setPoints((prev) => prev.map((p, idx) => idx === i ? { ...p, color } : p));

  const copyCss = async () => {
    await navigator.clipboard.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Approximate each radial layer with a canvas radial gradient.
    for (const p of points) {
      const cx = (p.x / 100) * w;
      const cy = (p.y / 100) * h;
      const r = Math.max(w, h) * 0.55;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mesh-gradient-${w}x${h}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="aspect-[16/9] w-full overflow-hidden border border-black/[0.08]"
          style={{ backgroundColor: base, backgroundImage: bg.replace(`,\n    ${base}`, '') }} />
        <div className="border border-black/[0.08] bg-[#0a0a0a]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">CSS</span>
            <button type="button" onClick={copyCss}
              className="flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-[#e5e5e5]">{css}</pre>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Palette</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {PALETTES.map((p, i) => (
              <button key={i} type="button" onClick={() => applyPalette(i)}
                className={`h-9 border transition ${paletteIdx === i ? 'border-[var(--color-fg)]' : 'border-black/[0.08]'}`}
                style={{ background: `linear-gradient(90deg, ${p.join(',')})` }} />
            ))}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Color points</div>
            <button type="button" onClick={addPoint} disabled={points.length >= 8}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-40">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {points.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="color" value={p.color} onChange={(e) => setPointColor(i, e.target.value)}
                  className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
                <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">{p.x}%, {p.y}%</span>
                {points.length > 2 && (
                  <button type="button" onClick={() => removePoint(i)}
                    className="ml-auto text-[var(--color-fg-muted)] hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
            Base
            <input type="color" value={base} onChange={(e) => setBase(e.target.value)}
              className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
          </label>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Width
            <input type="number" min={200} max={4000} value={w}
              onChange={(e) => setW(parseInt(e.target.value, 10) || 1600)}
              className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-generator)]" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Height
            <input type="number" min={200} max={4000} value={h}
              onChange={(e) => setH(parseInt(e.target.value, 10) || 900)}
              className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-generator)]" />
          </label>
        </div>

        <button type="button" onClick={shuffle}
          className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
          <RefreshCw className="h-3.5 w-3.5" />
          Shuffle positions
        </button>
        <button type="button" onClick={downloadPng}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
          <Download className="h-3.5 w-3.5" />
          Download PNG
        </button>
      </aside>
    </div>
  );
}
