'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Upload, Image as ImageIcon, Loader2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { decode, encode, type ImageFormat, FORMAT_TO_EXT } from '@/engines/image';
import { OPS } from '@/engines/image/ops';
import { ImageSession, workerSupported, type Progress } from '@/lib/compute/imageSession';
import { useImageDrop } from '@/lib/compute/useImageDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { useStagedInput } from '@/lib/ai/handoff';

export interface FilterControl {
  id: string;
  label: string;
  type: 'slider' | 'toggle' | 'select' | 'color';
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string | number; label: string }[];
  hint?: string;
}

type Options = Record<string, number | boolean | string>;

export interface ImageFilterToolProps {
  toolId: string;
  colorVar?: string;
  /** Preferred: a named engine op (runs in a Web Worker, off the main thread). */
  op?: string;
  /** Build the serializable params object for `op` from the current controls. */
  params?: (opts: Options) => Record<string, unknown>;
  /** Fallback / composite transform that runs on the main thread (no worker). */
  transform?: (data: ImageData, opts: Options) => ImageData | Promise<ImageData>;
  controls?: FilterControl[];
  defaultFormat?: ImageFormat;
  compare?: boolean;
  filenameSuffix?: string;
  emptyHint?: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

const EXPORT_FORMATS: { id: ImageFormat; label: string; lossy: boolean }[] = [
  { id: 'png',  label: 'PNG',  lossy: false },
  { id: 'jpeg', label: 'JPEG', lossy: true  },
  { id: 'webp', label: 'WebP', lossy: true  },
  { id: 'avif', label: 'AVIF', lossy: true  },
];

/**
 * Shared workhorse for filter-style image tools.
 *
 * Heavy work (transform + encode) runs in a Web Worker at FULL resolution, so
 * the UI never freezes — strong machines finish fast, slow machines just take
 * longer, both responsive with a progress bar. The live preview paints the
 * transformed pixels straight to a <canvas> (no per-edit encoding), and the
 * chosen format is only encoded once, on download.
 */
export function ImageFilterTool({
  toolId,
  colorVar = '--color-cat-image',
  op,
  params,
  transform,
  controls = [],
  defaultFormat = 'png',
  compare = true,
  filenameSuffix,
  emptyHint = 'JPG · PNG · WebP · AVIF — files stay yours',
}: ImageFilterToolProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const [outputBytes, setOutputBytes] = React.useState(0);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);

  const initialOpts = React.useMemo<Options>(
    () => Object.fromEntries(controls.map((c) => [c.id, c.defaultValue])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(controls.map((c) => [c.id, c.defaultValue]))],
  );
  const [opts, setOpts] = React.useState<Options>(initialOpts);
  const [format, setFormat] = React.useState<ImageFormat>(defaultFormat);
  const [quality, setQuality] = React.useState(92);
  const [decoding, setDecoding] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [exportProg, setExportProg] = React.useState<Progress | null>(null);
  const [comparePct, setComparePct] = React.useState(60);

  const useWorker = !!op && workerSupported();
  const sessionRef = React.useRef<ImageSession | null>(null);
  const decodedMainRef = React.useRef<ImageData | null>(null); // main-thread fallback source
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const previewToken = React.useRef(0);
  const draggingRef = React.useRef(false);
  const { guard, gate } = useUsageGate('image');

  // The unmount cleanup captures `sourceUrl` from the closure, but the deps
  // are empty — so it always saw the INITIAL empty string and never revoked
  // the URL of the most-recently-loaded file. Mirror sourceUrl into a ref so
  // the cleanup reads the current value.
  const sourceUrlRef = React.useRef('');
  React.useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);

  React.useEffect(() => {
    if (useWorker && !sessionRef.current) sessionRef.current = new ImageSession();
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildParams = React.useCallback(
    (o: Options): Record<string, unknown> => (params ? params(o) : (o as Record<string, unknown>)),
    [params],
  );

  const paint = React.useCallback((img: ImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setDecoding(true);
    setReady(false);
    try {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setSourceUrl(URL.createObjectURL(next));
      setFile(next);
      if (useWorker) {
        const d = await sessionRef.current!.load(next);
        setDims({ w: d.width, h: d.height });
      } else {
        const { data } = await decode(next);
        decodedMainRef.current = data;
        setDims({ w: data.width, h: data.height });
      }
      setReady(true);
    } catch (err) {
      console.error(`${toolId} load failed`, err);
    } finally {
      setDecoding(false);
    }
  }, [sourceUrl, toolId, useWorker]);

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void loadFile(f); });

  const clear = React.useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl('');
    setFile(null);
    setReady(false);
    setDims(null);
    setOutputBytes(0);
    decodedMainRef.current = null;
  }, [sourceUrl]);

  // download is defined below; reference it through a ref so Enter always runs
  // the latest closure without reordering the component.
  const downloadRef = React.useRef<() => void>(() => {});

  // Clipboard paste (screenshot → tool), drag-anywhere hover state,
  // Esc to clear, Enter to download.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    onRun: ready ? () => downloadRef.current() : undefined,
  });

  // Live preview — full resolution, off the main thread, painted to canvas.
  const render = React.useCallback(async () => {
    if (!ready) return;
    const token = ++previewToken.current;
    setRendering(true);
    try {
      let img: ImageData;
      if (useWorker) {
        img = await sessionRef.current!.preview(op!, buildParams(opts));
      } else {
        const src = decodedMainRef.current;
        if (!src) return;
        // Yield once so the spinner can paint before a heavy main-thread op.
        await new Promise((r) => setTimeout(r, 0));
        img = transform ? await transform(src, opts) : await OPS[op!](src, buildParams(opts));
      }
      if (token !== previewToken.current) return; // superseded by a newer edit
      paint(img);
      // NOTE: don't set dims here — the preview is downscaled, so its size is
      // not the export size. dims stays at the full-res value from load and is
      // refreshed from the real output on download.
    } catch (err) {
      console.error(`${toolId} preview failed`, err);
    } finally {
      if (token === previewToken.current) setRendering(false);
    }
  }, [ready, useWorker, op, transform, opts, buildParams, paint, toolId]);

  React.useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => { void render(); }, 80);
    return () => clearTimeout(id);
  }, [ready, opts, render]);

  const download = async () => {
    if (!ready || !file) return;
    if (!(await guard({ bytes: file.size }))) return;
    setExportProg({ phase: 'Processing', ratio: 0.05 });
    try {
      let blob: Blob;
      let bytes: number;
      if (useWorker) {
        const r = await sessionRef.current!.exportImage(op!, buildParams(opts), format, quality, setExportProg);
        blob = r.blob; bytes = r.bytes;
        setDims({ w: r.width, h: r.height });
      } else {
        const src = decodedMainRef.current!;
        setExportProg({ phase: 'Processing', ratio: 0.2 });
        await new Promise((r) => setTimeout(r, 0));
        const out = transform ? await transform(src, opts) : await OPS[op!](src, buildParams(opts));
        setExportProg({ phase: 'Encoding', ratio: 0.6 });
        const r = await encode(out, format, { quality });
        blob = r.blob; bytes = r.bytes;
        setDims({ w: out.width, h: out.height });
      }
      setOutputBytes(bytes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base = file.name.replace(/\.[^.]+$/, '');
      a.href = url;
      a.download = `${base}${filenameSuffix ?? `-${toolId.replace(/^image-/, '')}`}.${FORMAT_TO_EXT[format]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 60s defer matches the rest of the codebase — 4s was too short on
      // slow mobile networks where the download dialog opens late and the
      // browser aborts the download when the blob URL goes away.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      try { setRecent(toolId, await makeThumb(blob, 192)); } catch { /* ignore */ }
    } catch (err) {
      console.error(`${toolId} export failed`, err);
    } finally {
      setExportProg(null);
    }
  };
  downloadRef.current = () => { if (ready && exportProg === null) void download(); };

  const onComparePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateCompare(e);
  };
  const onComparePointerMove = (e: React.PointerEvent) => { if (draggingRef.current) updateCompare(e); };
  const onComparePointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const updateCompare = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setComparePct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  const exporting = exportProg !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {gate}
      <div
        ref={stageRef}
        {...dropZone}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border bg-[oklch(20%_0.008_250)] transition-colors',
          dragging ? 'border-2 border-dashed' : 'border border-black/[0.08]',
          !sourceUrl && 'flex items-center justify-center',
        )}
        style={dragging ? { borderColor: `var(${colorVar})` } : undefined}
      >
        {!sourceUrl && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">Drop, paste or click</div>
              <div className="mt-1 text-[13px] text-white/55">{emptyHint}</div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <span className="border border-white/10 px-3 py-1.5">browse</span>
              <span className="text-white/40">or paste a screenshot</span>
            </div>
          </button>
        )}

        {/* Drag-over affordance while a loaded image is on the stage. */}
        {sourceUrl && dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="border-2 border-dashed border-white/70 px-5 py-3 text-[14px] font-semibold text-white">
              Drop to replace
            </div>
          </div>
        )}

        {sourceUrl && (
          <>
            {/* Filtered preview — painted pixels, full resolution, no encoding. */}
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />
            {compare && (
              <>
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparePct}% 0 0)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sourceUrl} alt="original" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                </div>
                <div
                  onPointerDown={onComparePointerDown}
                  onPointerMove={onComparePointerMove}
                  onPointerUp={onComparePointerUp}
                  className="absolute top-0 bottom-0 z-10 cursor-ew-resize"
                  style={{ left: `${comparePct}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="h-full w-0.5 bg-white/80 shadow-[0_0_0_1px_oklch(0%_0_0/0.4)]" />
                  <div className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-black shadow-lg">
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                </div>
              </>
            )}

            {(rendering || decoding) && !exporting && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {decoding ? 'Reading…' : 'Rendering…'}
              </div>
            )}

            {/* Export progress — covers the heavy one-time encode. */}
            {exporting && (
              <div className="absolute inset-x-3 bottom-3 bg-black/70 px-3 py-2.5 backdrop-blur">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white">
                  <span>{exportProg?.phase ?? 'Working'}…</span>
                  <span className="tabular-nums">{Math.round((exportProg?.ratio ?? 0) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden bg-white/15">
                  <div className="h-full transition-[width] duration-200" style={{ width: `${Math.round((exportProg?.ratio ?? 0) * 100)}%`, background: `var(${colorVar})` }} />
                </div>
              </div>
            )}

            {dims && !exporting && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                {dims.w}×{dims.h}{outputBytes > 0 && <span className="text-white/50">· {formatBytes(outputBytes)}</span>}
              </div>
            )}
          </>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
      </div>

      <aside className="space-y-5">
        {controls.length > 0 && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-5">
            {controls.map((c) => (
              <ControlRow key={c.id} control={c} value={opts[c.id]} onChange={(v) => setOpts((o) => ({ ...o, [c.id]: v }))} colorVar={colorVar} />
            ))}
          </div>
        )}

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Save as</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {EXPORT_FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                className={cn('border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition', format === f.id ? 'text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}
                style={format === f.id ? { background: `var(${colorVar})`, borderColor: `var(${colorVar})` } : undefined}>
                {f.label}
              </button>
            ))}
          </div>
          {EXPORT_FORMATS.find((f) => f.id === format)?.lossy && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-fg-subtle)]">Quality</span>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--color-fg)]">{quality}</span>
              </div>
              <Slider.Root value={[quality]} onValueChange={([v]) => setQuality(v)} min={40} max={100} step={1} className="relative mt-2 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full" style={{ background: `var(${colorVar})` }} /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] outline-none" style={{ background: `var(${colorVar})` }} />
              </Slider.Root>
            </div>
          )}
        </div>

        <button type="button" onClick={download} disabled={!ready || exporting}
          className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition', ready && !exporting ? 'text-white shadow-lg hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}
          style={ready && !exporting ? { background: `var(${colorVar})` } : undefined}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? `${exportProg?.phase ?? 'Working'}… ${Math.round((exportProg?.ratio ?? 0) * 100)}%` : 'Download'}
        </button>

        {file && (
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
            <ImageIcon className="h-4 w-4" /> Replace image
          </button>
        )}
      </aside>
    </div>
  );
}

function ControlRow({
  control, value, onChange, colorVar,
}: {
  control: FilterControl;
  value: number | boolean | string;
  onChange: (v: number | boolean | string) => void;
  colorVar: string;
}) {
  if (control.type === 'slider') {
    const v = Number(value);
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{control.label}</label>
          <span className="font-mono text-[18px] font-semibold tabular-nums text-[var(--color-fg)]">
            {v}{control.unit && <span className="text-[12px] font-medium text-[var(--color-fg-subtle)]">{control.unit}</span>}
          </span>
        </div>
        <Slider.Root value={[v]} onValueChange={([next]) => onChange(next)} min={control.min ?? 0} max={control.max ?? 100} step={control.step ?? 1} className="relative mt-3 flex h-5 w-full touch-none items-center">
          <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full" style={{ background: `var(${colorVar})` }} /></Slider.Track>
          <Slider.Thumb className="block h-5 w-5 border-2 border-[var(--color-fg)] outline-none" style={{ background: `var(${colorVar})` }} />
        </Slider.Root>
        {control.hint && <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{control.hint}</div>}
      </div>
    );
  }
  if (control.type === 'toggle') {
    const v = Boolean(value);
    return (
      <button type="button" onClick={() => onChange(!v)} className="group flex w-full items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--color-fg)]">{control.label}</span>
        <span className={cn('relative h-5 w-9 transition', v ? '' : 'bg-black/[0.1]')} style={v ? { background: `var(${colorVar})` } : undefined}>
          <span className={cn('absolute top-0.5 h-4 w-4 bg-white transition-transform', v ? 'translate-x-4' : 'translate-x-0.5')} />
        </span>
      </button>
    );
  }
  if (control.type === 'select') {
    const v = String(value);
    return (
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{control.label}</label>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {control.options?.map((o) => {
            const active = String(o.value) === v;
            return (
              <button key={o.value} type="button" onClick={() => onChange(typeof o.value === 'number' ? o.value : String(o.value))}
                className={cn('border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition', active ? 'text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}
                style={active ? { background: `var(${colorVar})`, borderColor: `var(${colorVar})` } : undefined}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (control.type === 'color') {
    const v = String(value);
    return (
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{control.label}</label>
        <div className="mt-2 flex items-center gap-2">
          <input type="color" value={v} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
          <input type="text" value={v} onChange={(e) => onChange(e.target.value)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
        </div>
      </div>
    );
  }
  return null;
}

async function makeThumb(blob: Blob, maxEdge: number): Promise<string> {
  const bm = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale));
    const h = Math.max(1, Math.round(bm.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(bm, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.6);
  } finally {
    // Always release — the previous code only closed on the success path,
    // so a `ctx === null` return (rare but possible) or any throw leaked
    // the bitmap.
    try { bm.close(); } catch { /* */ }
  }
}
