'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download } from 'lucide-react';

type Format = 'png' | 'jpeg';

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, fontSize: number) {
  if (!text) return;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  for (let i = 0; i < lines.length; i++) {
    const ly = y + i * lineHeight;
    ctx.lineWidth = Math.max(2, Math.floor(fontSize / 10));
    ctx.strokeText(lines[i], x, ly);
    ctx.fillText(lines[i], x, ly);
  }
}

export default function ImageMemeTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [top, setTop] = React.useState('TOP TEXT');
  const [bottom, setBottom] = React.useState('BOTTOM TEXT');
  const [fontSize, setFontSize] = React.useState(56);
  const [fontFamily, setFontFamily] = React.useState('Impact');
  const [color, setColor] = React.useState('#ffffff');
  const [outline, setOutline] = React.useState('#000000');
  const [format, setFormat] = React.useState<Format>('png');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (url) URL.revokeObjectURL(url);
    const u = URL.createObjectURL(next);
    const img = new Image();
    img.src = u;
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Could not read image')); });
    setFile(next);
    setUrl(u);
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
  };

  React.useEffect(() => {
    if (!file || !url || !dims) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.src = url;
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.strokeStyle = outline;
      ctx.lineJoin = 'round';
      const padding = Math.floor(fontSize * 0.3);
      const maxW = dims.w - padding * 2;
      drawText(ctx, top.toUpperCase(), dims.w / 2, padding, maxW, fontSize * 1.05, fontSize);

      ctx.textBaseline = 'bottom';
      const lines = bottom.split(/\s+/).reduce<string[]>((acc, word) => {
        const last = acc[acc.length - 1] || '';
        const test = last ? `${last} ${word}` : word;
        if (ctx.measureText(test).width > maxW && last) acc.push(word);
        else acc[acc.length - 1] = test;
        return acc;
      }, ['']);
      const yStart = dims.h - padding - (lines.length - 1) * fontSize * 1.05;
      for (let i = 0; i < lines.length; i++) {
        const ly = yStart + i * fontSize * 1.05;
        ctx.strokeText(lines[i].toUpperCase(), dims.w / 2, ly);
        ctx.fillText(lines[i].toUpperCase(), dims.w / 2, ly);
      }
    };
  }, [file, url, dims, top, bottom, fontSize, fontFamily, color, outline]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-meme.${format === 'jpeg' ? 'jpg' : 'png'}`;
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
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Top text</div>
            <input value={top} onChange={(e) => setTop(e.target.value)}
              placeholder="TOP TEXT"
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Bottom text</div>
            <input value={bottom} onChange={(e) => setBottom(e.target.value)}
              placeholder="BOTTOM TEXT"
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</span>
              <span className="font-mono text-[12px] tabular-nums">{fontSize}px</span>
            </div>
            <Slider.Root value={[fontSize]} min={20} max={140} step={2}
              onValueChange={([v]) => setFontSize(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Font</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {['Impact', 'Anton', 'Arial Black'].map((f) => (
                <button key={f} type="button" onClick={() => setFontFamily(f)}
                  className={`border py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${fontFamily === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}
                  style={{ fontFamily: f }}>
                  {f.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Fill
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Outline
              <input type="color" value={outline} onChange={(e) => setOutline(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
          </div>
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
              Download meme
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
