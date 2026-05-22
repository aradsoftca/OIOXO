'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { decode, encode, type ImageFormat } from '@/engines/image';

interface Pos { id: string; label: string; ax: number; ay: number; }
const POSITIONS: Pos[] = [
  { id: 'tl', label: 'Top L',   ax: 0.05, ay: 0.10 },
  { id: 'tr', label: 'Top R',   ax: 0.95, ay: 0.10 },
  { id: 'bl', label: 'Bot L',   ax: 0.05, ay: 0.92 },
  { id: 'br', label: 'Bot R',   ax: 0.95, ay: 0.92 },
  { id: 'c',  label: 'Center',  ax: 0.50, ay: 0.50 },
];

export default function Tool() {
  const [src, setSrc] = React.useState<{ file: File; url: string; data: ImageData } | null>(null);
  const [text, setText] = React.useState('© Your Brand');
  const [fontSize, setFontSize] = React.useState(48);
  const [opacity, setOpacity] = React.useState(0.5);
  const [color, setColor] = React.useState('#ffffff');
  const [pos, setPos] = React.useState(POSITIONS[3]);
  const [tile, setTile] = React.useState(false);
  const [tileAngle, setTileAngle] = React.useState(-30);
  const [format, setFormat] = React.useState<ImageFormat>('png');
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (src?.url) URL.revokeObjectURL(src.url); }, [src]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const render = React.useCallback(async () => {
    if (!src) return null;
    const c = document.createElement('canvas');
    c.width = src.data.width; c.height = src.data.height;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(src.data, 0, 0);
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    if (tile) {
      const m = ctx.measureText(text);
      const stepX = m.width + fontSize * 2;
      const stepY = fontSize * 3;
      ctx.save();
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((tileAngle * Math.PI) / 180);
      ctx.translate(-c.width, -c.height);
      ctx.textBaseline = 'middle';
      for (let y = 0; y < c.height * 2; y += stepY) {
        for (let x = 0; x < c.width * 2; x += stepX) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      ctx.textAlign = pos.ax < 0.4 ? 'left' : pos.ax > 0.6 ? 'right' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, c.width * pos.ax, c.height * pos.ay);
    }
    return c;
  }, [src, text, fontSize, color, opacity, pos, tile, tileAngle]);

  React.useEffect(() => {
    if (!src) return;
    let cancelled = false;
    (async () => {
      const c = await render();
      if (!c || cancelled) return;
      c.toBlob((b) => {
        if (b && !cancelled) {
          setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); });
        }
      }, 'image/png');
    })();
    return () => { cancelled = true; };
  }, [src, render]);

  const loadFile = async (file: File) => {
    setError(''); setBusy(true);
    try {
      const { data } = await decode(file);
      const url = URL.createObjectURL(file);
      setSrc({ file, url, data });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const exportImg = async () => {
    if (!src) return;
    setBusy(true); setError('');
    try {
      const c = await render();
      if (!c) return;
      const imgData = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      const { blob } = await encode(imgData, format);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = src.file.name.replace(/\.[^.]+$/, '') + '-watermark.' + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!src && (
        <label className="block">
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
          <div className="cursor-pointer border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-12 text-center transition hover:border-[var(--color-cat-image)]">
            <div className="text-[14px] font-bold">Drop an image</div>
            <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">JPG · PNG · WebP · AVIF</div>
          </div>
        </label>
      )}

      {src && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{src.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{src.data.width}×{src.data.height}</span>
            <button type="button" onClick={() => setSrc(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="border border-black/[0.08] bg-black/[0.02] p-2">
              {previewUrl && <img src={previewUrl} alt="preview" className="mx-auto block max-h-[60vh] object-contain" />}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Text</div>
                  <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-image)]" />
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</span>
                      <span className="font-mono text-[12px] tabular-nums font-bold">{fontSize}px</span>
                    </div>
                    <Slider.Root value={[fontSize]} min={16} max={Math.max(100, Math.round(src.data.width * 0.2))} step={2}
                      onValueChange={([v]) => setFontSize(v)}
                      className="relative mt-2 flex h-5 w-full touch-none items-center">
                      <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                      <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
                    </Slider.Root>
                  </div>
                  <label className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Color</span>
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-8 w-10 cursor-pointer border-0 bg-transparent" />
                  </label>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Opacity</span>
                    <span className="font-mono text-[12px] tabular-nums font-bold">{Math.round(opacity * 100)}%</span>
                  </div>
                  <Slider.Root value={[opacity]} min={0.1} max={1} step={0.05}
                    onValueChange={([v]) => setOpacity(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
                  </Slider.Root>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-cat-image)]" />
                  <span className="text-[12px] font-semibold">Tile across entire image</span>
                </label>
                {tile ? (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Angle</span>
                      <span className="font-mono text-[12px] tabular-nums font-bold">{tileAngle}°</span>
                    </div>
                    <Slider.Root value={[tileAngle]} min={-90} max={90} step={5}
                      onValueChange={([v]) => setTileAngle(v)}
                      className="relative mt-2 flex h-5 w-full touch-none items-center">
                      <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                      <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
                    </Slider.Root>
                  </div>
                ) : (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Position</div>
                    <div className="grid grid-cols-5 gap-1">
                      {POSITIONS.map((p) => (
                        <button key={p.id} type="button" onClick={() => setPos(p)}
                          className={`border py-2 text-[10px] font-bold transition ${pos.id === p.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08]'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Export</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['png', 'jpeg', 'webp'] as ImageFormat[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08]'}`}>
                      {f === 'jpeg' ? 'JPG' : f}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" onClick={exportImg} disabled={busy || !text.trim()}
                className="w-full bg-[var(--color-cat-image)] text-white py-3 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
                {busy ? 'Working…' : 'Stamp & Download'}
              </button>
              {error && <div className="text-[11px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
