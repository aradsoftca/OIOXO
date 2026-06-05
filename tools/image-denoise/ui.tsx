'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, Loader2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useImageDrop } from '@/lib/compute/useImageDrop';

type Format = 'png' | 'jpeg';

/**
 * Edge-preserving bilateral denoise on raw pixels. Spatial weight smooths
 * neighbours; range weight keeps strong edges. Pure JS — no GPU, no model.
 */
function bilateral(src: ImageData, radius: number, sigmaColor: number): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od = out.data;
  // Precompute spatial kernel (Gaussian) — sigmaSpace tied to radius.
  const sigmaSpace = radius / 2 || 1;
  const spatial: number[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      spatial.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace)));
  const inv2sc = 1 / (2 * sigmaColor * sigmaColor);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y * w + x) * 4;
      const cr = data[ci], cg = data[ci + 1], cb = data[ci + 2];
      let sr = 0, sg = 0, sb = 0, sw = 0, k = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) { k += 2 * radius + 1; continue; }
        for (let dx = -radius; dx <= radius; dx++, k++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          const dr = data[i] - cr, dg = data[i + 1] - cg, db = data[i + 2] - cb;
          const range = Math.exp(-(dr * dr + dg * dg + db * db) * inv2sc);
          const wgt = spatial[k] * range;
          sr += data[i] * wgt; sg += data[i + 1] * wgt; sb += data[i + 2] * wgt; sw += wgt;
        }
      }
      od[ci] = sr / sw; od[ci + 1] = sg / sw; od[ci + 2] = sb / sw; od[ci + 3] = data[ci + 3];
    }
  }
  return out;
}

export default function ImageDenoiseTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [srcUrl, setSrcUrl] = React.useState('');
  const [outUrl, setOutUrl] = React.useState('');
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [strength, setStrength] = React.useState(2);
  const [radius, setRadius] = React.useState(2);
  const [format, setFormat] = React.useState<Format>('png');
  const [busy, setBusy] = React.useState(false);
  const [compare, setCompare] = React.useState(50);
  const [showCompare, setShowCompare] = React.useState(false);
  const srcRef = React.useRef<ImageData | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef(false);

  // Unmount-only. With [srcUrl, outUrl] generating an output revoked srcUrl
  // (still in use as the left-half of the slider) — the source image vanished.
  const srcUrlRef = React.useRef('');
  const outUrlRef = React.useRef('');
  React.useEffect(() => { srcUrlRef.current = srcUrl; outUrlRef.current = outUrl; }, [srcUrl, outUrl]);
  React.useEffect(() => () => {
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
  }, []);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (outUrl) URL.revokeObjectURL(outUrl);
    setOutUrl(''); setShowCompare(false);
    const bm = await createImageBitmap(next);
    // Cap working size so the per-pixel filter stays responsive.
    const maxEdge = 2200;
    const scale = Math.min(1, maxEdge / Math.max(bm.width, bm.height));
    const w = Math.round(bm.width * scale), h = Math.round(bm.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bm, 0, 0, w, h);
    bm.close();
    srcRef.current = ctx.getImageData(0, 0, w, h);
    setFile(next);
    setSrcUrl(canvas.toDataURL());
    setDims({ w, h });
  };

  const run = async () => {
    if (!srcRef.current) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20)); // let spinner paint
    try {
      const result = bilateral(srcRef.current, radius, strength * 12);
      const canvas = document.createElement('canvas');
      canvas.width = result.width; canvas.height = result.height;
      canvas.getContext('2d')!.putImageData(result, 0, 0);
      if (outUrl) URL.revokeObjectURL(outUrl);
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95));
      setOutUrl(URL.createObjectURL(blob));
      setShowCompare(true); setCompare(50);
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!outUrl || !file) return;
    const a = document.createElement('a');
    a.href = outUrl;
    a.download = file.name.replace(/\.[^.]+$/, '') + `-denoised.${format === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const moveCompare = (clientX: number) => {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setCompare(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  const clear = React.useCallback(() => {
    setSrcUrl((u) => { if (u) URL.revokeObjectURL(u); return ''; });
    setOutUrl((u) => { if (u) URL.revokeObjectURL(u); return ''; });
    srcRef.current = null;
    setFile(null);
    setDims(null);
    setShowCompare(false);
  }, []);

  // Enter runs the latest closure; mirror through a ref so we don't reorder.
  const runRef = React.useRef<() => void>(() => {});
  runRef.current = () => { void run(); };

  // Clipboard paste (screenshot → denoise), drag-anywhere hover state,
  // Esc to clear, Enter to apply.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    onRun: file && !busy ? () => runRef.current() : undefined,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        {!file ? (
          <div {...dropZone}
            className={cn(
              'flex aspect-[4/3] items-center justify-center border border-dashed bg-[var(--color-surface-1)] transition-colors',
              dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.18]',
            )}>
            <label className="flex cursor-pointer flex-col items-center gap-3 text-center text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" /> {dragging ? 'Drop to denoise' : 'Drop, paste or click to browse'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
            </label>
          </div>
        ) : (
          <div ref={stageRef}
            onPointerDown={(e) => { if (!showCompare) return; dragRef.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); moveCompare(e.clientX); }}
            onPointerMove={(e) => { if (dragRef.current) moveCompare(e.clientX); }}
            onPointerUp={(e) => { dragRef.current = false; (e.target as HTMLElement).releasePointerCapture(e.pointerId); }}
            className="relative overflow-hidden border border-black/[0.08] bg-black/5">
            <img src={outUrl || srcUrl} alt="" className="block h-auto w-full" />
            {showCompare && outUrl && (
              <>
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                  <img src={srcUrl} alt="original" className="block h-auto w-full" />
                </div>
                <div className="absolute top-0 bottom-0 z-10 cursor-ew-resize" style={{ left: `${compare}%`, transform: 'translateX(-50%)' }}>
                  <div className="h-full w-0.5 bg-white shadow-[0_0_0_1px_oklch(0%_0_0/0.4)]" />
                  <div className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-black shadow-lg"><ArrowLeftRight className="h-4 w-4" /></div>
                </div>
              </>
            )}
            {busy && <div className="absolute inset-0 grid place-items-center bg-black/50 text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {dims && <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 font-mono text-[11px] text-white">{dims.w}×{dims.h}</div>}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Strength</span>
              <span className="font-mono text-[12px] tabular-nums">{strength.toFixed(1)}</span>
            </div>
            <Slider.Root value={[strength]} min={0.5} max={6} step={0.5} onValueChange={([v]) => setStrength(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Detail radius</span>
              <span className="font-mono text-[12px] tabular-nums">{radius}px</span>
            </div>
            <Slider.Root value={[radius]} min={1} max={4} step={1} onValueChange={([v]) => setRadius(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
            <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Larger radius removes more noise but softens fine detail.</div>
          </div>
          <div>
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
        </div>
        {file && (
          <>
            <button type="button" onClick={run} disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{busy ? 'Working…' : 'Denoise'}
            </button>
            <button type="button" onClick={download} disabled={!outUrl}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button type="button" onClick={() => { setFile(null); srcRef.current = null; }}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              Replace image
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
