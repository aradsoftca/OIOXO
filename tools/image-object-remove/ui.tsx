'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, Loader2, Eraser, Wand2, Undo2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { loadOpenCv } from '@/engines/opencv';

const MAX_EDGE = 1600;

export default function ObjectRemoveTool() {
  const [hasImage, setHasImage] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [brush, setBrush] = React.useState(36);
  const [resultUrl, setResultUrl] = React.useState('');
  const [dirty, setDirty] = React.useState(false);

  const baseRef = React.useRef<HTMLCanvasElement>(null);   // source pixels (working res)
  const maskRef = React.useRef<HTMLCanvasElement>(null);   // red brush strokes
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const painting = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const load = React.useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const bm = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bm.width, bm.height));
    const w = Math.round(bm.width * scale), h = Math.round(bm.height * scale);
    const base = baseRef.current!, mask = maskRef.current!;
    base.width = mask.width = w; base.height = mask.height = h;
    base.getContext('2d')!.drawImage(bm, 0, 0, w, h);
    mask.getContext('2d')!.clearRect(0, 0, w, h);
    bm.close();
    setHasImage(true); setResultUrl(''); setDirty(false);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = maskRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    if (resultUrl) return;
    painting.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    last.current = pos(e); paintDot(last.current);
  };
  const move = (e: React.PointerEvent) => {
    if (!painting.current) return;
    const p = pos(e); const ctx = maskRef.current!.getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,40,40,0.6)'; ctx.lineWidth = brush; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setDirty(true);
  };
  const up = () => { painting.current = false; last.current = null; };
  const paintDot = (p: { x: number; y: number }) => {
    const ctx = maskRef.current!.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,40,40,0.6)'; ctx.beginPath(); ctx.arc(p.x, p.y, brush / 2, 0, Math.PI * 2); ctx.fill(); setDirty(true);
  };
  const clearMask = () => { const m = maskRef.current; if (m) m.getContext('2d')!.clearRect(0, 0, m.width, m.height); setDirty(false); };

  const remove = async () => {
    const base = baseRef.current, mask = maskRef.current;
    if (!base || !mask || !dirty) return;
    setBusy(true);
    try {
      const cv = await loadOpenCv();
      const w = base.width, h = base.height;
      const src = cv.imread(base);            // RGBA
      const srcRgb = new cv.Mat();
      cv.cvtColor(src, srcRgb, cv.COLOR_RGBA2RGB);

      // Build a 1-channel mask from the painted alpha.
      const md = mask.getContext('2d')!.getImageData(0, 0, w, h).data;
      const maskData = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) maskData[i] = md[i * 4 + 3] > 20 ? 255 : 0;
      const maskMat = cv.matFromArray(h, w, cv.CV_8UC1, maskData);

      const dst = new cv.Mat();
      cv.inpaint(srcRgb, maskMat, dst, 5, cv.INPAINT_TELEA);

      const outCanvas = document.createElement('canvas');
      cv.imshow(outCanvas, dst);
      src.delete(); srcRgb.delete(); maskMat.delete(); dst.delete();

      outCanvas.toBlob((blob) => {
        if (!blob) return;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(blob));
        void makeThumb(blob).then((t) => t && setRecent('image-object-remove', t));
      }, 'image/png');
    } catch (e) { console.error('inpaint failed', e); }
    finally { setBusy(false); }
  };

  const acceptResult = async () => {
    // Use the result as the new base so the user can keep erasing.
    if (!resultUrl || !baseRef.current) return;
    const bm = await createImageBitmap(await (await fetch(resultUrl)).blob());
    const base = baseRef.current, mask = maskRef.current!;
    base.getContext('2d')!.drawImage(bm, 0, 0); bm.close();
    mask.getContext('2d')!.clearRect(0, 0, mask.width, mask.height);
    URL.revokeObjectURL(resultUrl); setResultUrl(''); setDirty(false);
  };

  const download = (type: 'image/png' | 'image/jpeg') => {
    if (!resultUrl) return;
    fetch(resultUrl).then((r) => r.blob()).then((blob) => {
      if (type === 'image/jpeg') {
        createImageBitmap(blob).then((bm) => {
          const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
          const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bm, 0, 0); bm.close();
          c.toBlob((b) => b && saveBlob(b, 'jpg'), 'image/jpeg', 0.92);
        });
      } else saveBlob(blob, 'png');
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className={cn('relative border border-black/[0.08] bg-[oklch(20%_0.008_250)]', !hasImage && 'flex aspect-[4/3] items-center justify-center')}>
          {!hasImage && (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a photo</div>
                <div className="mt-1 text-[13px] text-white/55">Then brush over what you want gone · files stay yours</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
          )}
          {/* base + mask stay mounted; the result overlays them so refs persist */}
          <div className="relative" style={{ display: hasImage ? 'block' : 'none' }}>
            <canvas ref={baseRef} className="block w-full" />
            <canvas ref={maskRef} onPointerDown={down} onPointerMove={move} onPointerUp={up}
              className={cn('absolute inset-0 block w-full touch-none', resultUrl ? 'pointer-events-none opacity-0' : 'cursor-crosshair')} />
            {resultUrl && <img src={resultUrl} alt="result" className="absolute inset-0 block w-full" />}
          </div>
          {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><div className="flex items-center gap-2 text-white"><Wand2 className="h-5 w-5 animate-pulse" /> Filling…</div></div>}
        </div>
        {hasImage && !resultUrl && <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">Paint over the object, then press Remove. Works best on small-to-medium objects, blemishes and watermarks.</p>}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
      </div>

      <aside className="space-y-4">
        {hasImage && !resultUrl && (
          <>
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Brush size</label>
                <span className="font-mono text-[13px] text-[var(--color-fg)]">{brush}</span>
              </div>
              <Slider.Root value={[brush]} onValueChange={([v]) => setBrush(v)} min={6} max={120} step={2} className="relative mt-3 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                <Slider.Thumb className="block h-5 w-5 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)] outline-none" />
              </Slider.Root>
            </div>
            <button type="button" onClick={remove} disabled={!dirty || busy}
              className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition', dirty && !busy ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />} Remove
            </button>
            <button type="button" onClick={clearMask} disabled={!dirty} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50">
              <Undo2 className="h-4 w-4" /> Clear brush
            </button>
          </>
        )}

        {resultUrl && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => download('image/png')} className="flex items-center justify-center gap-1.5 bg-[var(--color-cat-image)] py-3 text-[13px] font-semibold text-white hover:brightness-110"><Download className="h-4 w-4" /> PNG</button>
              <button type="button" onClick={() => download('image/jpeg')} className="flex items-center justify-center gap-1.5 bg-[var(--color-fg)] py-3 text-[13px] font-semibold text-[var(--color-canvas)] hover:opacity-90"><Download className="h-4 w-4" /> JPG</button>
            </div>
            <button type="button" onClick={acceptResult} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              <Eraser className="h-4 w-4" /> Keep erasing on result
            </button>
          </>
        )}

        {hasImage && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <ImageIcon className="h-4 w-4" /> New photo
          </button>
        )}
      </aside>
    </div>
  );
}

function saveBlob(blob: Blob, ext: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cleaned.${ext}`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

async function makeThumb(blob: Blob): Promise<string> {
  try {
    const bm = await createImageBitmap(blob);
    const max = 192, scale = Math.min(1, max / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale)), h = Math.max(1, Math.round(bm.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return '';
    ctx.drawImage(bm, 0, 0, w, h); bm.close();
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return ''; }
}
