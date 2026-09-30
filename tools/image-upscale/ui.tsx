'use client';

import * as React from 'react';
import { Upload, Loader2, Download, Image as ImageIcon, ArrowLeftRight, Wand2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IS_OIOXO } from '@/lib/brand';
import { setRecent } from '@/lib/storage/recent';
import { upscale, type UpscaleFactor, type UpscaleQuality, type UpscaleProgress } from '@/engines/upscale';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { ProBadge } from '@/components/limits/ProBadge';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { enforcePolicy } from '@/lib/limits/server-check';
import { useImageDrop } from '@/lib/compute/useImageDrop';

const POLICY_KEY = 'image-upscale';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

// xonvert: 2× only — the 4× Swin2SR models are ~50 MB fp32 with no lightweight
// variant (too heavy/slow on a phone). oioxo keeps 4×.
const FACTORS: { v: UpscaleFactor; label: string }[] = IS_OIOXO
  ? [{ v: 2, label: '2×' }, { v: 4, label: '4×' }]
  : [{ v: 2, label: '2×' }];

const QUALITIES: { v: UpscaleQuality; label: string; hint: string }[] = [
  { v: 'fast',       label: 'Fast',       hint: 'Quickest pass. Best for everyday photos and screenshots.' },
  { v: 'balanced',   label: 'Balanced',   hint: 'Sharper detail across textures. A bit slower.' },
  ...(IS_OIOXO ? [{ v: 'real-world' as UpscaleQuality, label: 'Real-world', hint: '4× only. Tuned for blurry phone shots and compressed images.' }] : []),
];

export default function ImageUpscaleTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState<string>('');
  const [outputBlob, setOutputBlob] = React.useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = React.useState<string>('');
  const [srcDims, setSrcDims] = React.useState<{ w: number; h: number } | null>(null);
  const [outDims, setOutDims] = React.useState<{ w: number; h: number } | null>(null);
  const [factor, setFactor] = React.useState<UpscaleFactor>(2);
  const [quality, setQuality] = React.useState<UpscaleQuality>('fast');
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState<UpscaleProgress | null>(null);
  const [compare, setCompare] = React.useState(50);
  const [showCompare, setShowCompare] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef(false);

  // Unmount-only cleanup driven by refs. The previous version used `[]` deps
  // and read sourceUrl/outputUrl by closure — but those captured the INITIAL
  // values (empty strings), so the URLs current at unmount were never freed.
  const sourceUrlRef = React.useRef(sourceUrl);
  const outputUrlRef = React.useRef(outputUrl);
  React.useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);
  React.useEffect(() => { outputUrlRef.current = outputUrl; }, [outputUrl]);
  React.useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  // Real-world is only valid at 4×
  React.useEffect(() => {
    if (quality === 'real-world' && factor === 2) setQuality('fast');
  }, [factor, quality]);

  const run = React.useCallback(async (target: File) => {
    const specs: { type: 'lever'; lever: 'input-size' | 'output-resolution'; value: number }[] = [
      { type: 'lever', lever: 'input-size', value: target.size },
    ];
    if (srcDims) specs.push({ type: 'lever', lever: 'output-resolution', value: Math.max(srcDims.w, srcDims.h) * factor });
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, specs);
    if (!ok) return;
    setRunning(true);
    setError('');
    setProgress({ phase: 'Preparing', ratio: 0 });
    try {
      const blob = await upscale(target, {
        factor,
        quality,
        onProgress: (p) => setProgress(p),
      });
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      const url = URL.createObjectURL(blob);
      setOutputBlob(blob);
      setOutputUrl(url);

      const bm = await createImageBitmap(blob);
      setOutDims({ w: bm.width, h: bm.height });
      bm.close();
      setShowCompare(true);
      setCompare(50);

      const thumb = await makeThumb(blob, 192);
      setRecent('image-upscale', thumb);
    } catch (err) {
      console.error('upscale failed', err);
      setError((err as Error)?.name === 'DeviceLimitError' ? (err as Error).message : 'Could not enlarge this image on this device.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [factor, quality, outputUrl, isPro, policyGate, srcDims]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    const url = URL.createObjectURL(next);

    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
    setFile(next);
    setSourceUrl(url);
    setSrcDims({ w: img.naturalWidth, h: img.naturalHeight });
    setOutputBlob(null);
    setOutputUrl('');
    setOutDims(null);
    setShowCompare(false);
  }, [sourceUrl, outputUrl]);

  const clear = React.useCallback(() => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    setFile(null);
    setSourceUrl('');
    setOutputBlob(null);
    setOutputUrl('');
    setSrcDims(null);
    setOutDims(null);
    setShowCompare(false);
  }, []);

  // Clipboard paste, drag-anywhere hover state, Esc to clear, Enter to enlarge.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    onRun: file && !running ? () => void run(file) : undefined,
  });

  const download = async () => {
    if (!outputBlob || !file) return;
    // Stamp the visible brand into the pixels for free sessions — the raw upscale
    // blob bypasses the canvas toBlob() patch, so without this the free output is
    // CLEAN and the Pro "no watermark" line is hollow. Pro → unchanged.
    const { stampImageBlob } = await import('@/lib/watermark/download');
    const blob = await stampImageBlob(outputBlob, { format: 'image/png' });
    const base = file.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${base}-${factor}x.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const onComparePointerDown = (e: React.PointerEvent) => {
    dragRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateCompare(e);
  };
  const onComparePointerMove = (e: React.PointerEvent) => { if (dragRef.current) updateCompare(e); };
  const onComparePointerUp = (e: React.PointerEvent) => {
    dragRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const updateCompare = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setCompare(pct);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {policyGate.element}
      <div
        ref={stageRef}
        {...dropZone}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border bg-[oklch(20%_0.008_250)] transition-colors',
          dragging ? 'border-2 border-dashed border-[var(--color-cat-image)]' : 'border-black/[0.08]',
          !sourceUrl && 'flex items-center justify-center',
        )}
      >
        {sourceUrl && dragging && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="border-2 border-dashed border-white/70 px-5 py-3 text-[14px] font-semibold text-white">
              Drop to replace
            </div>
          </div>
        )}
        {!sourceUrl && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-4 px-6 text-center"
          >
            <div className="bg-white/[0.06] p-4">
              <Upload className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">
                Drop, paste or click to enlarge
              </div>
              <div className="mt-1 text-[13px] text-white/55">
                JPG · PNG · WebP — small inputs upscale fastest
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <span className="border border-white/10 px-3 py-1.5">browse</span>
              <span className="text-white/40">or paste a screenshot</span>
            </div>
          </button>
        )}

        {sourceUrl && (
          <>
            {outputUrl ? (
              <img src={outputUrl} alt="result" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
            ) : (
              <img src={sourceUrl} alt="original" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
            )}

            {showCompare && outputUrl && (
              <>
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                  <img src={sourceUrl} alt="original" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                </div>
                <div
                  onPointerDown={onComparePointerDown}
                  onPointerMove={onComparePointerMove}
                  onPointerUp={onComparePointerUp}
                  className="absolute top-0 bottom-0 z-10 cursor-ew-resize"
                  style={{ left: `${compare}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="h-full w-0.5 bg-white shadow-[0_0_0_1px_oklch(0%_0_0/0.4)]" />
                  <div className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-black shadow-lg">
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                </div>
              </>
            )}

            {running && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                <div className="w-72 space-y-3 text-center">
                  <Wand2 className="mx-auto h-7 w-7 animate-pulse text-white" />
                  <div className="text-[14px] font-semibold text-white">
                    {progress?.phase ?? 'Working'}…
                  </div>
                  <div className="h-1 w-full overflow-hidden bg-white/10">
                    <div
                      className="h-full bg-[var(--color-cat-image)] transition-[width] duration-150 ease-out"
                      style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
              {srcDims && <>{srcDims.w}×{srcDims.h}</>}
              {outDims && (
                <>
                  <span className="text-white/40">→</span>
                  <span className="text-white">{outDims.w}×{outDims.h}</span>
                </>
              )}
              {outputBlob && <span className="text-white/50">· {formatBytes(outputBlob.size)}</span>}
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
        />
      </div>

      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Scale
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {FACTORS.map((f) => {
                const projected = srcDims ? Math.max(srcDims.w, srcDims.h) * f.v : 0;
                return (
                  <button
                    key={f.v}
                    type="button"
                    disabled={running}
                    onClick={() => setFactor(f.v)}
                    className={cn(
                      'relative border px-2 py-2 text-[12px] font-bold uppercase tracking-wider transition disabled:opacity-60',
                      factor === f.v
                        ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                        : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                    )}
                  >
                    <div className="absolute right-0.5 top-0.5"><ProBadge toolKey={POLICY_KEY} lever="output-resolution" value={projected} isPro={isPro} compact /></div>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-black/[0.06] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Quality
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {QUALITIES.map((q) => {
                const disabled = running || (q.v === 'real-world' && factor === 2);
                return (
                  <button
                    key={q.v}
                    type="button"
                    disabled={disabled}
                    onClick={() => setQuality(q.v)}
                    className={cn(
                      'border px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-40',
                      quality === q.v
                        ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                        : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                    )}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              {QUALITIES.find((q) => q.v === quality)?.hint}
            </div>
          </div>
        </div>

        {file && (
          <button
            type="button"
            onClick={() => void run(file)}
            disabled={running}
            className={cn(
              'flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold transition',
              running ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-image)] text-white hover:brightness-110',
            )}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Maximize2 className="h-4 w-4" />}
            {running ? 'Enlarging…' : `Enlarge ${factor}×`}
          </button>
        )}

        {error && <div className="text-[12px] leading-relaxed text-red-600">{error}</div>}

        <button
          type="button"
          onClick={download}
          disabled={!outputBlob || running}
          className={cn(
            'flex w-full items-center justify-center gap-2 border py-2.5 text-[12px] font-semibold transition',
            outputBlob && !running
              ? 'border-black/[0.08] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]'
              : 'border-black/[0.08] text-[var(--color-fg-subtle)]',
          )}
        >
          <Download className="h-4 w-4" />
          Download
        </button>

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Replace image
          </button>
        )}

        {file && outputBlob && (
          <button
            type="button"
            onClick={() => setShowCompare((s) => !s)}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {showCompare ? 'Hide compare' : 'Compare with original'}
          </button>
        )}
      </aside>
    </div>
  );
}

async function makeThumb(blob: Blob, maxEdge: number): Promise<string> {
  const bm = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bm.width, bm.height));
  const w = Math.max(1, Math.round(bm.width * scale));
  const h = Math.max(1, Math.round(bm.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(bm, 0, 0, w, h);
  bm.close();
  return canvas.toDataURL('image/jpeg', 0.7);
}
