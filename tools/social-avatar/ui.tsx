'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = [128, 256, 512, 1024];

function render(canvas: HTMLCanvasElement | OffscreenCanvas, bm: ImageBitmap, opts: {
  size: number; zoom: number; offsetX: number; offsetY: number;
  borderWidth: number; borderColor: string; backgroundColor: string; transparent: boolean;
}) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  const { size, zoom, offsetX, offsetY, borderWidth, borderColor, backgroundColor, transparent } = opts;

  ctx.clearRect(0, 0, size, size);
  if (!transparent) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - borderWidth, 0, Math.PI * 2);
  ctx.clip();

  // Letterbox-cover with user-set zoom + pan
  const cover = Math.max(size / bm.width, size / bm.height) * zoom;
  const drawW = bm.width * cover;
  const drawH = bm.height * cover;
  const dx = (size - drawW) / 2 + offsetX * size;
  const dy = (size - drawH) / 2 + offsetY * size;
  ctx.drawImage(bm, dx, dy, drawW, drawH);
  ctx.restore();

  if (borderWidth > 0) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth * 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - borderWidth, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function Tool() {
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offsetX, setOffsetX] = React.useState(0);
  const [offsetY, setOffsetY] = React.useState(0);
  const [borderWidth, setBorderWidth] = React.useState(0);
  const [borderColor, setBorderColor] = React.useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = React.useState('#1e1e2e');
  const [transparent, setTransparent] = React.useState(true);
  const [exportSize, setExportSize] = React.useState(512);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!previewRef.current || !bitmap) return;
    render(previewRef.current, bitmap, { size: 400, zoom, offsetX, offsetY, borderWidth, borderColor, backgroundColor, transparent });
  }, [bitmap, zoom, offsetX, offsetY, borderWidth, borderColor, backgroundColor, transparent]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setBusy(true);
    try {
      if (bitmap) bitmap.close();
      const bm = await createImageBitmap(next);
      setBitmap(bm);
      setFile(next);
      setZoom(1); setOffsetX(0); setOffsetY(0);
    } finally {
      setBusy(false);
    }
  }, [bitmap]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const download = async () => {
    if (!bitmap || !file) return;
    const c = document.createElement('canvas');
    c.width = exportSize; c.height = exportSize;
    render(c, bitmap, { size: exportSize, zoom, offsetX, offsetY, borderWidth: borderWidth * (exportSize / 400), borderColor, backgroundColor, transparent });
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace(/\.[^.]+$/, '')}-avatar-${exportSize}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'flex aspect-square items-center justify-center border border-black/[0.08]',
          transparent ? '' : '',
        )}
        style={transparent ? {
          backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        } : { background: backgroundColor }}
      >
        {bitmap ? (
          <canvas ref={previewRef} width={400} height={400} className="h-full w-full" />
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 text-center">
            <Upload className="h-7 w-7 text-[var(--color-fg-muted)]" />
            <div className="text-[14px] font-semibold text-[var(--color-fg)]">Drop a photo</div>
            <div className="text-[11px] text-[var(--color-fg-muted)]">JPG · PNG · WebP</div>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        {busy && <Loader2 className="absolute h-6 w-6 animate-spin" />}
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          {([
            ['zoom',    'Zoom',     1,   3,    0.05, zoom, setZoom],
            ['offsetX', 'Pan X',   -0.5, 0.5,  0.01, offsetX, setOffsetX],
            ['offsetY', 'Pan Y',   -0.5, 0.5,  0.01, offsetY, setOffsetY],
            ['border',  'Border',  0,    32,   1,    borderWidth, setBorderWidth],
          ] as const).map(([key, label, min, max, step, value, setter]) => (
            <div key={key}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
                <span className="font-mono text-[12px] tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
              </div>
              <Slider.Root value={[value]} min={min} max={max} step={step}
                onValueChange={([v]) => (setter as (n: number) => void)(v)}
                className="relative mt-1 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-social)]" /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-social)]" />
              </Slider.Root>
            </div>
          ))}
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Border</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={backgroundColor} onChange={(e) => { setBackgroundColor(e.target.value); setTransparent(false); }} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Background</span>
            <button type="button" onClick={() => setTransparent((t) => !t)} className={`ml-auto border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${transparent ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
              {transparent ? '✓ Transparent' : 'Transparent'}
            </button>
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Export size</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {SIZES.map((s) => (
              <button key={s} type="button" onClick={() => setExportSize(s)}
                className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${exportSize === s ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={download} disabled={!bitmap}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-social)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" /> Download PNG
        </button>
      </aside>
    </div>
  );
}
