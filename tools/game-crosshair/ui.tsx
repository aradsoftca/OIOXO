'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download } from 'lucide-react';

interface Cfg {
  color: string;
  outline: string;
  thickness: number;
  length: number;
  gap: number;
  dot: number;
  outlineWidth: number;
}

function draw(canvas: HTMLCanvasElement | OffscreenCanvas, cfg: Cfg, scale = 1, dark = true) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (dark) {
    ctx.fillStyle = 'oklch(20% 0.008 250)';
    ctx.fillRect(0, 0, W, H);
  }
  const cx = W / 2, cy = H / 2;
  const t = cfg.thickness * scale;
  const len = cfg.length * scale;
  const gap = cfg.gap * scale;
  const dot = cfg.dot * scale;
  const ow = cfg.outlineWidth * scale;

  const drawBar = (x: number, y: number, w: number, h: number) => {
    if (ow > 0) {
      ctx.fillStyle = cfg.outline;
      ctx.fillRect(x - ow, y - ow, w + ow * 2, h + ow * 2);
    }
    ctx.fillStyle = cfg.color;
    ctx.fillRect(x, y, w, h);
  };

  // Top
  drawBar(cx - t / 2, cy - gap - len, t, len);
  // Bottom
  drawBar(cx - t / 2, cy + gap, t, len);
  // Left
  drawBar(cx - gap - len, cy - t / 2, len, t);
  // Right
  drawBar(cx + gap, cy - t / 2, len, t);

  if (dot > 0) {
    if (ow > 0) {
      ctx.fillStyle = cfg.outline;
      ctx.beginPath();
      ctx.arc(cx, cy, dot / 2 + ow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = cfg.color;
    ctx.beginPath();
    ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function Tool() {
  const previewRef = React.useRef<HTMLCanvasElement>(null);
  const [cfg, setCfg] = React.useState<Cfg>({
    color: '#00ff66',
    outline: '#000000',
    thickness: 2,
    length: 8,
    gap: 4,
    dot: 0,
    outlineWidth: 1,
  });

  React.useEffect(() => {
    if (previewRef.current) draw(previewRef.current, cfg, 6, true);
  }, [cfg]);

  const download = () => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    draw(c, cfg, 1, false);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'crosshair.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)] p-8">
        <canvas ref={previewRef} width={400} height={400} className="max-h-[480px] w-full max-w-[480px]" />
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.color} onChange={(e) => setCfg((c) => ({ ...c, color: e.target.value }))} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
              <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Reticle</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.outline} onChange={(e) => setCfg((c) => ({ ...c, outline: e.target.value }))} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
              <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Outline</span>
            </div>
          </div>
          {([
            ['thickness', 'Thickness', 1, 8],
            ['length',    'Line length', 0, 24],
            ['gap',       'Center gap',  0, 24],
            ['dot',       'Center dot',  0, 8],
            ['outlineWidth', 'Outline width', 0, 4],
          ] as const).map(([k, label, min, max]) => (
            <div key={k}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
                <span className="font-mono text-[13px] tabular-nums">{cfg[k]}</span>
              </div>
              <Slider.Root
                value={[cfg[k] as number]}
                min={min}
                max={max}
                step={1}
                onValueChange={([v]) => setCfg((c) => ({ ...c, [k]: v }))}
                className="relative mt-1 flex h-5 w-full touch-none items-center"
              >
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-game)]" /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-game)]" />
              </Slider.Root>
            </div>
          ))}
        </div>

        <button type="button" onClick={download} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-game)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
          <Download className="h-3.5 w-3.5" /> Download PNG
        </button>
      </aside>
    </div>
  );
}
