'use client';

import * as React from 'react';
import { Download, RefreshCw } from 'lucide-react';

type Fill = 'solid' | 'gradient' | 'noise';
type Format = 'png' | 'jpeg';

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Square', w: 600, h: 600 },
  { label: '16:9', w: 1280, h: 720 },
  { label: '4:3', w: 1024, h: 768 },
  { label: 'OG image', w: 1200, h: 630 },
  { label: 'Story', w: 1080, h: 1920 },
  { label: 'Banner', w: 1500, h: 500 },
];

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function GenLoremImageTool() {
  const [w, setW] = React.useState(1280);
  const [h, setH] = React.useState(720);
  const [fill, setFill] = React.useState<Fill>('gradient');
  const [showLabel, setShowLabel] = React.useState(true);
  const [color, setColor] = React.useState('#6366f1');
  const [seed, setSeed] = React.useState(1);
  const [format, setFormat] = React.useState<Format>('png');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const render = React.useCallback((canvas: HTMLCanvasElement) => {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (fill === 'solid') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
    } else if (fill === 'gradient') {
      const hue = (seed * 47) % 360;
      const c1 = hslToHex(hue, 65, 55);
      const c2 = hslToHex((hue + 60) % 360, 65, 45);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      // Deterministic value-noise blocks.
      const block = Math.max(8, Math.round(Math.min(w, h) / 32));
      let s = seed * 9301 + 49297;
      const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const baseHue = (seed * 73) % 360;
      for (let y = 0; y < h; y += block) {
        for (let x = 0; x < w; x += block) {
          const l = 30 + rand() * 50;
          ctx.fillStyle = hslToHex(baseHue, 40, l);
          ctx.fillRect(x, y, block, block);
        }
      }
    }

    if (showLabel) {
      const text = `${w} × ${h}`;
      const fontSize = Math.max(20, Math.round(Math.min(w, h) / 8));
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(2, fontSize / 14);
      ctx.strokeText(text, w / 2, h / 2);
      ctx.fillText(text, w / 2, h / 2);
    }
  }, [w, h, fill, showLabel, color, seed]);

  React.useEffect(() => {
    if (canvasRef.current) render(canvasRef.current);
  }, [render]);

  const download = () => {
    const canvas = document.createElement('canvas');
    render(canvas);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `placeholder-${w}x${h}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:24px_24px]">
        <canvas ref={canvasRef} className="block h-auto max-h-[520px] w-full object-contain" />
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Preset</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => { setW(p.w); setH(p.h); }}
                className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${w === p.w && h === p.h ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Width
              <input type="number" min={1} max={5000} value={w}
                onChange={(e) => setW(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-generator)]" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Height
              <input type="number" min={1} max={5000} value={h}
                onChange={(e) => setH(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-generator)]" />
            </label>
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Fill</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(['solid', 'gradient', 'noise'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFill(f)}
                  className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${fill === f ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {fill === 'solid' && (
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
          )}
          {fill !== 'solid' && (
            <button type="button" onClick={() => setSeed((s) => s + 1)}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <RefreshCw className="h-3 w-3" />
              Shuffle colors
            </button>
          )}
          <label className="flex items-center justify-between text-[11px] text-[var(--color-fg)]">
            <span className="font-medium">Show size label</span>
            <input type="checkbox" checked={showLabel} onChange={(e) => setShowLabel(e.target.checked)} className="h-4 w-4" />
          </label>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['png', 'jpeg'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)}
                className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {f === 'jpeg' ? 'JPG' : 'PNG'}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={download}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
          <Download className="h-3.5 w-3.5" />
          Download {w}×{h}
        </button>
      </aside>
    </div>
  );
}
