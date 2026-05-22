'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, X, ArrowUp, ArrowDown } from 'lucide-react';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { runFfmpegMulti, downloadBlob } from '@/engines/ffmpeg';

interface Item { file: File; url: string; bitmap: ImageBitmap }

const RES = [
  { label: '720p', w: 1280, h: 720 },
  { label: '1080p', w: 1920, h: 1080 },
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Vertical', w: 1080, h: 1920 },
];

/** Letterbox an image onto a WxH canvas and return a PNG Blob. */
async function toFramePng(bm: ImageBitmap, W: number, H: number, bg: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const scale = Math.min(W / bm.width, H / bm.height);
  const dw = bm.width * scale, dh = bm.height * scale;
  ctx.drawImage(bm, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), 'image/png'));
}

export default function ImagesToVideoTool() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [secs, setSecs] = React.useState(3);
  const [resIdx, setResIdx] = React.useState(1);
  const [bg, setBg] = React.useState('#000000');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { items.forEach((i) => { URL.revokeObjectURL(i.url); i.bitmap.close(); }); }, [items]);

  const add = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { setError('Drop one or more images.'); return; }
    setError('');
    const loaded = await Promise.all(list.map(async (file) => ({ file, url: URL.createObjectURL(file), bitmap: await createImageBitmap(file) })));
    setItems((prev) => [...prev, ...loaded]);
  };
  const removeAt = (i: number) => setItems((prev) => { URL.revokeObjectURL(prev[i].url); prev[i].bitmap.close(); return prev.filter((_, idx) => idx !== i); });
  const move = (i: number, d: -1 | 1) => setItems((prev) => { const j = i + d; if (j < 0 || j >= prev.length) return prev; const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const run = async () => {
    if (!items.length) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const { w: W, h: H } = RES[resIdx];
      const frames = await Promise.all(items.map((it) => toFramePng(it.bitmap, W, H, bg)));
      const inputs = frames.map((data, i) => ({ name: `frame${String(i).padStart(4, '0')}.png`, data }));
      const fps = (1 / secs).toFixed(6);
      const blob = await runFfmpegMulti({
        inputs,
        outputName: 'out.mp4',
        args: (_names, o) => [
          '-framerate', fps, '-i', 'frame%04d.png',
          '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o,
        ],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      const base = items.length === 1 ? items[0].file.name.replace(/\.[^.]+$/, '') : `slideshow-${items.length}`;
      downloadBlob(blob, `${base}.mp4`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const total = (items.length * secs).toFixed(0);

  return (
    <div className="space-y-4">
      <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-5">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
          <Upload className="h-4 w-4" /> Drop image(s) — BMP, JPG, PNG, WebP, GIF — or click to add
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] max-h-[440px] overflow-y-auto">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-black/[0.04] px-3 py-2 last:border-b-0">
                <span className="w-5 text-center font-mono text-[11px] text-[var(--color-fg-muted)]">{i + 1}</span>
                <img src={it.url} alt="" className="h-12 w-16 border border-black/[0.08] object-cover" />
                <span className="flex-1 truncate text-[12px] text-[var(--color-fg)]">{it.file.name}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                <button type="button" onClick={() => removeAt(i)} className="border border-black/[0.08] p-1.5 text-[var(--color-fg-muted)] hover:text-red-600"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>

          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Seconds per image</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{secs}s</span>
                </div>
                <Slider.Root value={[secs]} min={1} max={10} step={1} onValueChange={([v]) => setSecs(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Total length ≈ {total}s</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Resolution</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {RES.map((r, i) => (
                    <button key={r.label} type="button" onClick={() => setResIdx(i)}
                      className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${resIdx === i ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                Letterbox color
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
              </label>
            </div>
            <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Make video" busyLabel="Rendering…" onClick={run} error={error} />
          </aside>
        </div>
      )}
    </div>
  );
}
