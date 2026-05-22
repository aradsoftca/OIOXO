'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download } from 'lucide-react';

export default function ImageAddShadowTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [blur, setBlur] = React.useState(40);
  const [offsetX, setOffsetX] = React.useState(0);
  const [offsetY, setOffsetY] = React.useState(30);
  const [opacity, setOpacity] = React.useState(0.45);
  const [margin, setMargin] = React.useState(80);
  const [color, setColor] = React.useState('#000000');
  const [bg, setBg] = React.useState('transparent');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => () => { bitmap?.close(); }, [bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
  };

  const render = React.useCallback((canvas: HTMLCanvasElement) => {
    if (!bitmap) return;
    const m = margin;
    canvas.width = bitmap.width + m * 2;
    canvas.height = bitmap.height + m * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.save();
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    ctx.shadowColor = `rgba(${r},${g},${b},${opacity})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offsetX;
    ctx.shadowOffsetY = offsetY;
    ctx.drawImage(bitmap, m, m);
    ctx.restore();
  }, [bitmap, blur, offsetX, offsetY, opacity, margin, color, bg]);

  React.useEffect(() => { if (canvasRef.current) render(canvasRef.current); }, [render]);

  const download = () => {
    if (!file || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name.replace(/\.[^.]+$/, '') + '-shadow.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  const sliders = [
    { label: 'Blur', value: blur, set: setBlur, min: 0, max: 120, step: 2, unit: 'px' },
    { label: 'Offset X', value: offsetX, set: setOffsetX, min: -100, max: 100, step: 2, unit: 'px' },
    { label: 'Offset Y', value: offsetY, set: setOffsetY, min: -100, max: 100, step: 2, unit: 'px' },
    { label: 'Margin', value: margin, set: setMargin, min: 0, max: 200, step: 5, unit: 'px' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        {!file ? (
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
          >
            <label className="flex cursor-pointer flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              Drop an image (PNG with transparency works best)
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
            </label>
          </div>
        ) : (
          <div className="overflow-hidden border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:24px_24px]">
            <canvas ref={canvasRef} className="block h-auto w-full" />
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          {sliders.map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{s.label}</span>
                <span className="font-mono text-[12px] tabular-nums">{s.value}{s.unit}</span>
              </div>
              <Slider.Root value={[s.value]} min={s.min} max={s.max} step={s.step}
                onValueChange={([v]) => s.set(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
              </Slider.Root>
            </div>
          ))}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Opacity</span>
              <span className="font-mono text-[12px] tabular-nums">{Math.round(opacity * 100)}%</span>
            </div>
            <Slider.Root value={[opacity]} min={0} max={1} step={0.05}
              onValueChange={([v]) => setOpacity(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Shadow
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
              Backdrop
              <button type="button" onClick={() => setBg('transparent')} className={`h-7 w-7 border bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:8px_8px] ${bg === 'transparent' ? 'border-[var(--color-fg)]' : 'border-black/[0.08]'}`} />
              <input type="color" value={bg === 'transparent' ? '#ffffff' : bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </div>
          </div>
        </div>
        {file && (
          <>
            <button type="button" onClick={download}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Download className="h-3.5 w-3.5" /> Download PNG
            </button>
            <button type="button" onClick={() => { setFile(null); bitmap?.close(); setBitmap(null); }}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              Replace image
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
