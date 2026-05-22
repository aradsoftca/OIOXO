'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download } from 'lucide-react';

type Style = 'solid' | 'polaroid' | 'film' | 'browser' | 'shadow';
type Format = 'png' | 'jpeg';

export default function ImageFrameTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [style, setStyle] = React.useState<Style>('polaroid');
  const [size, setSize] = React.useState(48);
  const [color, setColor] = React.useState('#ffffff');
  const [caption, setCaption] = React.useState('');
  const [format, setFormat] = React.useState<Format>('png');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { bitmap?.close(); }, [bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
  };

  const renderTo = React.useCallback((canvas: HTMLCanvasElement) => {
    if (!bitmap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const iw = bitmap.width;
    const ih = bitmap.height;
    const m = size;

    let totalW = iw + m * 2;
    let totalH = ih + m * 2;
    let drawX = m, drawY = m;
    let captionBand = 0;
    let chromeBand = 0;

    if (style === 'polaroid') {
      // Standard polaroid has a fatter bottom border.
      captionBand = Math.floor(m * 2.2);
      totalH = ih + m * 2 + captionBand;
    } else if (style === 'film') {
      // Film strip: top + bottom black bars with perforations.
      chromeBand = Math.max(40, Math.floor(m * 0.9));
      totalH = ih + chromeBand * 2;
      totalW = iw + 0;
      drawX = 0;
      drawY = chromeBand;
    } else if (style === 'browser') {
      chromeBand = Math.max(40, Math.floor(m * 0.7));
      totalW = iw + 0;
      totalH = ih + chromeBand;
      drawX = 0;
      drawY = chromeBand;
    } else if (style === 'shadow') {
      // No border, just a soft shadow.
      const pad = Math.floor(m * 0.9);
      totalW = iw + pad * 2;
      totalH = ih + pad * 2;
      drawX = pad;
      drawY = pad;
    }

    canvas.width = totalW;
    canvas.height = totalH;

    // Background fill
    if (style === 'film') {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, totalW, totalH);
    } else if (style === 'shadow') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, totalW, totalH);
    } else if (style === 'browser') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, totalW, totalH);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, totalW, totalH);
    }

    if (style === 'shadow') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.floor(m * 1.2);
      ctx.shadowOffsetY = Math.floor(m * 0.4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(drawX, drawY, iw, ih);
      ctx.restore();
    }

    if (style === 'film') {
      // Perforation holes — two rows of squares at top/bottom.
      const holeSize = Math.floor(chromeBand * 0.35);
      const gap = holeSize * 1.6;
      const startX = gap / 2;
      ctx.fillStyle = '#111';
      const stripY = [Math.floor((chromeBand - holeSize) / 2), totalH - chromeBand + Math.floor((chromeBand - holeSize) / 2)];
      ctx.fillStyle = '#1c1917';
      for (const yPos of stripY) {
        for (let x = startX; x + holeSize < totalW; x += gap) {
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(x, yPos, holeSize, holeSize);
        }
      }
    }

    if (style === 'browser') {
      // Window chrome with traffic-light circles.
      const r = Math.floor(chromeBand * 0.18);
      const cy = Math.floor(chromeBand / 2);
      const baseX = Math.floor(chromeBand * 0.45);
      const colors = ['#ef4444', '#f59e0b', '#22c55e'];
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.fillStyle = colors[i];
        ctx.arc(baseX + i * r * 2.6, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // URL bar
      const barH = Math.floor(chromeBand * 0.45);
      const barY = Math.floor((chromeBand - barH) / 2);
      const barX = Math.floor(chromeBand * 1.8);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(barX, barY, totalW - barX - Math.floor(chromeBand * 0.45), barH);
    }

    ctx.drawImage(bitmap, drawX, drawY, iw, ih);

    if (style === 'polaroid' && caption.trim()) {
      ctx.fillStyle = '#222';
      const fontSize = Math.max(20, Math.floor(captionBand * 0.4));
      ctx.font = `${fontSize}px "Caveat", "Comic Sans MS", cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, totalW / 2, ih + m + captionBand / 2);
    }
  }, [bitmap, style, size, color, caption]);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    renderTo(canvasRef.current);
  }, [renderTo]);

  const download = () => {
    if (!file || !bitmap) return;
    const canvas = document.createElement('canvas');
    renderTo(canvas);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-${style}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {!file ? (
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
          >
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              Drop a photo or click to browse
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
          </div>
        ) : (
          <div className="overflow-hidden border border-black/[0.08] bg-black/5">
            <canvas ref={canvasRef} className="block h-auto w-full" />
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Frame style</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['solid', 'polaroid', 'film', 'browser', 'shadow'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStyle(s)}
                className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${style === s ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Border / padding</span>
              <span className="font-mono text-[12px] tabular-nums">{size}px</span>
            </div>
            <Slider.Root value={[size]} min={0} max={200} step={2}
              onValueChange={([v]) => setSize(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          {(style === 'solid' || style === 'polaroid' || style === 'browser' || style === 'shadow') && (
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              {style === 'shadow' ? 'Backdrop' : 'Frame color'}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
          )}
          {style === 'polaroid' && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Caption</div>
              <input value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional caption"
                className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
            </div>
          )}
        </div>

        {file && (
          <>
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['png', 'jpeg'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {f === 'jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={download}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              Replace image
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
