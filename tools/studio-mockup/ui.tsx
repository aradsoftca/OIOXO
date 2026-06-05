'use client';

/**
 * Screenshot Studio — oioxo / newxonvert version.
 * Drop a screenshot → gradient/solid backdrop, padding, rounded corners,
 * shadow and an optional browser frame, composited on a <canvas> and exported
 * as PNG. On-device.
 */

import * as React from 'react';
import { Upload, Download } from 'lucide-react';

const GRADIENTS: Array<[string, string]> = [
  ['#6366f1', '#ec4899'], ['#0ea5e9', '#22d3ee'], ['#f97316', '#db2777'],
  ['#22c55e', '#0d9488'], ['#a855f7', '#6366f1'], ['#1e293b', '#334155'],
  ['#fbbf24', '#f97316'], ['#f43f5e', '#a855f7'],
];

export default function ScreenshotStudioUI() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const [hasImg, setHasImg] = React.useState(false);
  const [grad, setGrad] = React.useState(0);
  const [solid, setSolid] = React.useState(false);
  const [solidColor, setSolidColor] = React.useState('#0f172a');
  const [pad, setPad] = React.useState(12);     // % of longest edge
  const [radius, setRadius] = React.useState(16);
  const [shadow, setShadow] = React.useState(true);
  const [frame, setFrame] = React.useState(true);

  const render = React.useCallback(() => {
    const canvas = canvasRef.current; const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;

    const iw = img.naturalWidth, ih = img.naturalHeight;
    const p = Math.round(Math.max(iw, ih) * (pad / 100));
    const bar = frame ? Math.max(28, Math.round(iw * 0.04)) : 0;
    const W = iw + p * 2, H = ih + bar + p * 2;
    canvas.width = W; canvas.height = H;

    // backdrop
    if (solid) { ctx.fillStyle = solidColor; }
    else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, GRADIENTS[grad][0]); g.addColorStop(1, GRADIENTS[grad][1]); ctx.fillStyle = g; }
    ctx.fillRect(0, 0, W, H);

    const x = p, y = p, w = iw, h = ih + bar, r = Math.min(radius, w / 2, h / 2);

    if (shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.round(p * 0.9); ctx.shadowOffsetY = Math.round(p * 0.35); }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = '#ffffff'; ctx.fill();
    if (shadow) ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
    if (frame) {
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x, y, w, bar);
      const dot = bar * 0.22, cy = y + bar / 2;
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + bar * 0.6 + i * dot * 2.4, cy, dot, 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.drawImage(img, x, y + bar, iw, ih);
    ctx.restore();
  }, [grad, solid, solidColor, pad, radius, shadow, frame]);

  React.useEffect(() => { render(); }, [render]);

  const load = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setHasImg(true); URL.revokeObjectURL(url); render(); };
    // Without an error path, a corrupt or unsupported image leaked the
    // blob URL until tab close.
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const download = () => {
    const c = canvasRef.current; if (!c || !hasImg) return;
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'screenshot.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const labelCls = 'text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]';
  const Slider = ({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) => (
    <div>
      <div className="flex items-baseline justify-between"><span className={labelCls}>{label}</span><span className="font-mono text-[12px]">{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-cat-image)]" />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex items-center justify-center border border-black/[0.08] bg-[var(--color-surface-2)] p-4" style={{ minHeight: 360 }}>
        {hasImg ? <canvas ref={canvasRef} className="max-h-[60vh] w-auto max-w-full" />
          : <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-3 px-8 py-16 text-[var(--color-fg-muted)]"><Upload className="h-8 w-8" /><span className="text-[14px]">Drop a screenshot or click to upload</span></button>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
      </div>

      <aside className="space-y-4">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Upload className="h-3.5 w-3.5" /> {hasImg ? 'Replace' : 'Upload'}</button>

        <div>
          <div className={labelCls}>Backdrop</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GRADIENTS.map((g, i) => (
              <button key={i} type="button" onClick={() => { setGrad(i); setSolid(false); }} className={`h-7 w-7 rounded-full border-2 ${!solid && grad === i ? 'border-[var(--color-fg)]' : 'border-black/15'}`} style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }} />
            ))}
            <label className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 ${solid ? 'border-[var(--color-fg)]' : 'border-black/15'}`} style={{ background: solidColor }}>
              <input type="color" value={solidColor} onChange={(e) => { setSolidColor(e.target.value); setSolid(true); }} className="h-0 w-0 opacity-0" />
            </label>
          </div>
        </div>

        <Slider label="Padding" value={pad} set={setPad} min={0} max={30} />
        <Slider label="Corner radius" value={radius} set={setRadius} min={0} max={48} />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-fg)]"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> Shadow</label>
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-fg)]"><input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} /> Window frame</label>
        </div>

        <button type="button" onClick={download} disabled={!hasImg} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[13px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"><Download className="h-4 w-4" /> Download PNG</button>
      </aside>
    </div>
  );
}
