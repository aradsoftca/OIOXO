'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download } from 'lucide-react';

type Mode = 'tile' | 'mirror' | 'half-drop' | 'half-brick';
type Format = 'png' | 'jpeg';

export default function ImagePatternTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [mode, setMode] = React.useState<Mode>('tile');
  const [outW, setOutW] = React.useState(1600);
  const [outH, setOutH] = React.useState(1200);
  const [tileSize, setTileSize] = React.useState(200);
  const [bg, setBg] = React.useState('#ffffff');
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
    // Pick a tile size that roughly matches the source aspect.
    const target = Math.min(400, Math.max(80, Math.round(bm.width / 4)));
    setTileSize(target);
  };

  const renderTo = React.useCallback((canvas: HTMLCanvasElement) => {
    if (!bitmap) return;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, outW, outH);

    const tileW = tileSize;
    const tileH = tileSize * (bitmap.height / bitmap.width);

    const cols = Math.ceil(outW / tileW) + 2;
    const rows = Math.ceil(outH / tileH) + 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let dx = c * tileW;
        let dy = r * tileH;
        if (mode === 'half-drop') dy += (c % 2 === 0 ? 0 : tileH / 2);
        if (mode === 'half-brick') dx += (r % 2 === 0 ? 0 : tileW / 2);
        ctx.save();
        if (mode === 'mirror') {
          const flipX = c % 2 === 1;
          const flipY = r % 2 === 1;
          if (flipX || flipY) {
            ctx.translate(dx + (flipX ? tileW : 0), dy + (flipY ? tileH : 0));
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            ctx.drawImage(bitmap, 0, 0, tileW, tileH);
          } else {
            ctx.drawImage(bitmap, dx, dy, tileW, tileH);
          }
        } else {
          ctx.drawImage(bitmap, dx, dy, tileW, tileH);
        }
        ctx.restore();
      }
    }
  }, [bitmap, outW, outH, tileSize, mode, bg]);

  React.useEffect(() => {
    if (canvasRef.current) renderTo(canvasRef.current);
  }, [renderTo]);

  const download = () => {
    if (!bitmap) return;
    const canvas = document.createElement('canvas');
    renderTo(canvas);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `pattern-${mode}-${outW}x${outH}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
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
              Drop a tile image — small motifs work best
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
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Pattern mode</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['tile', 'mirror', 'half-drop', 'half-brick'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Tile size</span>
              <span className="font-mono text-[12px] tabular-nums">{tileSize}px</span>
            </div>
            <Slider.Root value={[tileSize]} min={32} max={Math.min(800, outW)} step={4}
              onValueChange={([v]) => setTileSize(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Width
              <input type="number" min={100} max={4000} step={50} value={outW}
                onChange={(e) => setOutW(parseInt(e.target.value, 10) || 1600)}
                className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Height
              <input type="number" min={100} max={4000} step={50} value={outH}
                onChange={(e) => setOutH(parseInt(e.target.value, 10) || 1200)}
                className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
            Background
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)}
              className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
          </label>
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
              Replace tile
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
