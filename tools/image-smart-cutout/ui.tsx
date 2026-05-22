'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react';
import { Upload, Download, Loader2, Wand2, Scissors, Plus, Minus, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { prepare, segment, type SamSession, type SamPoint } from '@/engines/sam';

export default function SmartCutoutTool() {
  const [imgUrl, setImgUrl] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'working'>('idle');
  const [loadText, setLoadText] = React.useState('');
  const [mode, setMode] = React.useState<1 | 0>(1); // 1 = add (keep), 0 = remove area
  const [points, setPoints] = React.useState<SamPoint[]>([]);
  const [outUrl, setOutUrl] = React.useState('');
  const [err, setErr] = React.useState('');

  const baseRef = React.useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<SamSession | null>(null);
  const fileRef = React.useRef<File | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); if (outUrl) URL.revokeObjectURL(outUrl); }, [imgUrl, outUrl]);

  const load = React.useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setErr(''); setStatus('loading'); setPoints([]); setOutUrl(''); setLoadText('Loading AI model…');
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    fileRef.current = file;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    try {
      sessionRef.current = await prepare(file, (p: any) => {
        if (p?.status === 'progress' && p.file) setLoadText(`Loading model… ${Math.round(p.progress ?? 0)}%`);
        else if (p?.status === 'ready') setLoadText('Analyzing image…');
      });
      setStatus('ready');
    } catch (e) {
      console.error('SAM prepare failed', e);
      setErr('Could not load the segmentation model. Needs a modern desktop browser.');
      setStatus('idle');
    }
  }, [imgUrl]);

  const runSegment = React.useCallback(async (pts: SamPoint[]) => {
    const s = sessionRef.current;
    if (!s || pts.length === 0) { clearMask(); return; }
    setStatus('working');
    try {
      const { alpha, width, height } = await segment(s, pts);
      paintMask(alpha, width, height);
    } catch (e) {
      console.error('segment failed', e);
    } finally {
      setStatus('ready');
    }
  }, []);

  const onClick = (e: React.PointerEvent) => {
    if (status !== 'ready' && status !== 'working') return;
    const img = baseRef.current; const stage = stageRef.current;
    if (!img || !stage) return;
    const r = stage.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / r.width * img.naturalWidth);
    const y = Math.round((e.clientY - r.top) / r.height * img.naturalHeight);
    const next = [...points, { x, y, label: mode }];
    setPoints(next);
    void runSegment(next);
  };

  const paintMask = (alpha: Uint8Array, w: number, h: number) => {
    const c = maskCanvasRef.current; if (!c) return;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      if (alpha[i]) { img.data[i * 4] = 80; img.data[i * 4 + 1] = 160; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 130; }
    }
    ctx.putImageData(img, 0, 0);
  };
  const clearMask = () => { const c = maskCanvasRef.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };

  const reset = () => { setPoints([]); clearMask(); setOutUrl(''); };

  const cutout = async () => {
    const img = baseRef.current, mask = maskCanvasRef.current;
    if (!img || !mask || points.length === 0) return;
    setStatus('working');
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const octx = out.getContext('2d')!;
      octx.drawImage(img, 0, 0, w, h);
      const id = octx.getImageData(0, 0, w, h);
      // Mask canvas is at SAM's output resolution — sample it scaled to w×h.
      const mctx = mask.getContext('2d')!;
      const md = mctx.getImageData(0, 0, mask.width, mask.height).data;
      for (let y = 0; y < h; y++) {
        const my = Math.min(mask.height - 1, Math.floor(y * mask.height / h));
        for (let x = 0; x < w; x++) {
          const mx = Math.min(mask.width - 1, Math.floor(x * mask.width / w));
          const masked = md[(my * mask.width + mx) * 4 + 3] > 0;
          if (!masked) id.data[(y * w + x) * 4 + 3] = 0; // transparent outside the cutout
        }
      }
      octx.putImageData(id, 0, 0);
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
      if (blob) {
        if (outUrl) URL.revokeObjectURL(outUrl);
        setOutUrl(URL.createObjectURL(blob));
        const thumb = await makeThumb(blob); if (thumb) setRecent('image-smart-cutout', thumb);
      }
    } catch (e) { console.error('cutout failed', e); }
    finally { setStatus('ready'); }
  };

  const download = () => {
    if (!outUrl) return;
    const a = document.createElement('a'); a.href = outUrl;
    a.download = `${(fileRef.current?.name || 'cutout').replace(/\.[^.]+$/, '')}-cutout.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const busy = status === 'loading' || status === 'working';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className={cn('relative border border-black/[0.08] bg-[oklch(20%_0.008_250)]', !imgUrl && 'flex aspect-[4/3] items-center justify-center')}>
          {!imgUrl && (
            <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a photo</div>
                <div className="mt-1 text-[13px] text-white/55">Then click an object to cut it out · files stay yours</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
          )}
          {imgUrl && (
            <div ref={stageRef} className="relative" onPointerDown={onClick}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={baseRef} src={outUrl || imgUrl} alt="source" className="block w-full select-none" draggable={false} />
              {!outUrl && <canvas ref={maskCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />}
              {points.map((p, i) => (
                <span key={i} className={cn('pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white', p.label ? 'bg-green-500' : 'bg-red-500')}
                  style={{ left: `${(p.x / (baseRef.current?.naturalWidth || 1)) * 100}%`, top: `${(p.y / (baseRef.current?.naturalHeight || 1)) * 100}%` }} />
              ))}
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><div className="flex items-center gap-2"><Wand2 className="h-5 w-5 animate-pulse" /> {status === 'loading' ? loadText : 'Segmenting…'}</div></div>}
            </div>
          )}
        </div>
        {err && <div className="text-[13px] text-red-600">{err}</div>}
        {imgUrl && !outUrl && status === 'ready' && <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">Click the object you want. Add more points to refine; switch to “Remove area” to subtract.</p>}
      </div>

      <aside className="space-y-4">
        {imgUrl && !outUrl && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setMode(1)} className={cn('flex items-center justify-center gap-1.5 border py-2.5 text-[12px] font-bold transition', mode === 1 ? 'border-green-500 bg-green-500 text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]')}><Plus className="h-3.5 w-3.5" /> Add</button>
              <button type="button" onClick={() => setMode(0)} className={cn('flex items-center justify-center gap-1.5 border py-2.5 text-[12px] font-bold transition', mode === 0 ? 'border-red-500 bg-red-500 text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]')}><Minus className="h-3.5 w-3.5" /> Remove area</button>
            </div>
            <button type="button" onClick={cutout} disabled={points.length === 0 || busy}
              className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition', points.length && !busy ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Cut out
            </button>
            <button type="button" onClick={reset} disabled={!points.length} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Clear points</button>
          </>
        )}
        {outUrl && (
          <>
            <button type="button" onClick={download} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Download className="h-4 w-4" /> Download PNG</button>
            <button type="button" onClick={() => setOutUrl('')} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]">Refine again</button>
          </>
        )}
        {imgUrl && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60"><ImageIcon className="h-4 w-4" /> New photo</button>
        )}
        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">A small AI model loads once (cached after), then runs entirely in your browser — the photo never leaves your device.</p>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
      </aside>
    </div>
  );
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
