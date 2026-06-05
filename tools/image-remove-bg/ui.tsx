'use client';

import * as React from 'react';
import { Download, Upload, Image as ImageIcon, Loader2, ArrowLeftRight, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { removeBackground, type BgRemoveQuality } from '@/engines/image';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'image-remove-bg';

type BackdropKind = 'transparent' | 'solid' | 'gradient';
interface Backdrop {
  kind: BackdropKind;
  color?: string;
  color2?: string;
  angle?: number;
}

const PRESETS: { label: string; backdrop: Backdrop }[] = [
  { label: 'Transparent', backdrop: { kind: 'transparent' } },
  { label: 'White',  backdrop: { kind: 'solid', color: '#ffffff' } },
  { label: 'Black',  backdrop: { kind: 'solid', color: '#0a0a0a' } },
  { label: 'Studio', backdrop: { kind: 'gradient', color: '#1a1a2e', color2: '#16213e', angle: 135 } },
  { label: 'Sand',   backdrop: { kind: 'solid', color: '#eadfc8' } },
  { label: 'Rose',   backdrop: { kind: 'gradient', color: '#fce4ec', color2: '#f8bbd0', angle: 160 } },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function checkerboardCss(size = 18): React.CSSProperties {
  return {
    backgroundImage:
      `linear-gradient(45deg, oklch(94% 0 0) 25%, transparent 25%),
       linear-gradient(-45deg, oklch(94% 0 0) 25%, transparent 25%),
       linear-gradient(45deg, transparent 75%, oklch(94% 0 0) 75%),
       linear-gradient(-45deg, transparent 75%, oklch(94% 0 0) 75%)`,
    backgroundSize: `${size * 2}px ${size * 2}px`,
    backgroundPosition: `0 0, 0 ${size}px, ${size}px -${size}px, -${size}px 0px`,
    backgroundColor: 'oklch(99% 0 0)',
  };
}

function backdropCss(b: Backdrop): React.CSSProperties {
  if (b.kind === 'transparent') return checkerboardCss();
  if (b.kind === 'solid') return { background: b.color };
  return { background: `linear-gradient(${b.angle ?? 135}deg, ${b.color}, ${b.color2})` };
}

export default function RemoveBackgroundTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState<string>('');
  const [outputBlob, setOutputBlob] = React.useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = React.useState<string>('');
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [progress, setProgress] = React.useState<{ phase: string; ratio: number } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [quality, setQuality] = React.useState<BgRemoveQuality>('balanced');
  const [backdrop, setBackdrop] = React.useState<Backdrop>(PRESETS[0].backdrop);
  const [customColor, setCustomColor] = React.useState('#88aaff');
  const [compare, setCompare] = React.useState<number>(0);
  const [showCompare, setShowCompare] = React.useState<boolean>(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const draggingCompareRef = React.useRef(false);

  // Ref-mirror so unmount cleanup reads CURRENT URLs, not the empty ones
  // captured at first render (the previous eslint-ignored deps version
  // leaked both loaded source and output URLs on every navigation away).
  const sourceUrlRef = React.useRef('');
  const outputUrlRef = React.useRef('');
  React.useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);
  React.useEffect(() => { outputUrlRef.current = outputUrl; }, [outputUrl]);
  React.useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  const run = React.useCallback(async (target: File) => {
    const sizeHit = checkLever(POLICY_KEY, 'input-size', target.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    setRunning(true);
    setProgress({ phase: 'Preparing', ratio: 0 });
    try {
      const result = await removeBackground(target, {
        format: 'image/png',
        quality,
        onProgress: (p) => setProgress(p),
      });

      if (outputUrl) URL.revokeObjectURL(outputUrl);
      const url = URL.createObjectURL(result);
      setOutputBlob(result);
      setOutputUrl(url);
      setShowCompare(true);
      setCompare(50);

      // Save a small thumb for the home tile (PNG with transparency, on white for visibility)
      const thumb = await makeThumb(result, 192);
      setRecent('image-remove-bg', thumb);
    } catch (err) {
      console.error('background removal failed', err);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [outputUrl, quality, isPro, policyGate]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    const url = URL.createObjectURL(next);

    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to read image'));
    });

    setFile(next);
    setSourceUrl(url);
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setOutputUrl('');
    setOutputBlob(null);
    setShowCompare(false);
    void run(next);
  }, [sourceUrl, outputUrl, run]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const onComparePointerDown = (e: React.PointerEvent) => {
    draggingCompareRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateCompare(e);
  };
  const onComparePointerMove = (e: React.PointerEvent) => {
    if (!draggingCompareRef.current) return;
    updateCompare(e);
  };
  const onComparePointerUp = (e: React.PointerEvent) => {
    draggingCompareRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const updateCompare = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setCompare(pct);
  };

  const download = async () => {
    if (!outputBlob || !file) return;
    // If backdrop isn't transparent, flatten before download
    let blob = outputBlob;
    if (backdrop.kind !== 'transparent') {
      blob = await flatten(outputBlob, backdrop);
    }
    // Stamp the visible brand into the pixels for free sessions — the raw model
    // blob never passes through the canvas toBlob() patch, so without this the
    // free cutout ships CLEAN and "no watermark" is a hollow Pro promise. Pro →
    // unchanged. Kept PNG so the transparent cutout stays transparent.
    const { stampImageBlob } = await import('@/lib/watermark/download');
    blob = await stampImageBlob(blob, { format: 'image/png' });
    const ext = backdrop.kind === 'transparent' ? 'png' : 'png';
    const base = file.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${base}-no-bg.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {policyGate.element}
      {/* Stage */}
      <div
        ref={stageRef}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border border-black/[0.08]',
          !sourceUrl && 'flex items-center justify-center bg-[oklch(20%_0.008_250)]',
        )}
        style={sourceUrl ? backdropCss(backdrop) : undefined}
      >
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
                Drop a photo here
              </div>
              <div className="mt-1 text-[13px] text-white/55">
                JPG · PNG · WebP · AVIF — files stay yours
              </div>
            </div>
            <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
              or click to browse
            </div>
          </button>
        )}

        {sourceUrl && (
          <>
            {/* Output (subject on chosen backdrop). When result not ready, show original */}
            {outputUrl ? (
              <img
                src={outputUrl}
                alt="result"
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <img
                src={sourceUrl}
                alt="original"
                className="absolute inset-0 h-full w-full object-contain opacity-60"
                draggable={false}
              />
            )}

            {/* Compare overlay (original on left, result on right) */}
            {showCompare && outputUrl && (
              <>
                <div
                  className="absolute inset-0"
                  style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                >
                  <img
                    src={sourceUrl}
                    alt="original"
                    className="absolute inset-0 h-full w-full object-contain"
                    draggable={false}
                  />
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

            {/* Working overlay */}
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

            {/* Meta */}
            {dims && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                {dims.w}×{dims.h}
                {outputBlob && <span className="text-white/50">· {formatBytes(outputBlob.size)}</span>}
              </div>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
          }}
        />
      </div>

      {/* Controls */}
      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Backdrop
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => {
                const active =
                  backdrop.kind === p.backdrop.kind &&
                  backdrop.color === p.backdrop.color &&
                  backdrop.color2 === p.backdrop.color2;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setBackdrop(p.backdrop)}
                    className={cn(
                      'relative h-12 border text-[10px] font-bold uppercase tracking-wider transition',
                      active
                        ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
                        : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                    )}
                    style={p.backdrop.kind === 'transparent' ? checkerboardCss(6) : backdropCss(p.backdrop)}
                  >
                    <span
                      className={cn(
                        'absolute bottom-1 left-1 right-1 truncate px-1 py-0.5',
                        p.backdrop.kind === 'transparent'
                          ? 'bg-white/85 text-black'
                          : p.backdrop.color === '#ffffff' || p.backdrop.color === '#eadfc8'
                            ? 'bg-black/15 text-black/80'
                            : 'bg-black/40 text-white',
                      )}
                    >
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setBackdrop({ kind: 'solid', color: e.target.value });
                }}
                className="h-9 w-9 cursor-pointer border border-black/[0.08]"
              />
              <button
                type="button"
                onClick={() => setBackdrop({ kind: 'solid', color: customColor })}
                className="flex-1 border border-black/[0.08] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
              >
                Use custom color
              </button>
            </div>
          </div>

          <div className="border-t border-black/[0.06] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Quality
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(['fast', 'balanced', 'high'] as BgRemoveQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={cn(
                    'border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition',
                    quality === q
                      ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              {quality === 'fast' && 'Quick result. Best for previewing or small subjects.'}
              {quality === 'balanced' && 'Recommended. Sharp edges, fast enough for everyday use.'}
              {quality === 'high' && 'Most detail at hair and fur — takes a bit longer.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!outputBlob || running}
          className={cn(
            'flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            outputBlob && !running
              ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110'
              : 'bg-black/[0.06] text-[var(--color-fg-subtle)]',
          )}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </button>

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
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

async function flatten(blob: Blob, b: Backdrop): Promise<Blob> {
  const bm = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bm.width;
  canvas.height = bm.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  if (b.kind === 'solid' && b.color) {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (b.kind === 'gradient' && b.color && b.color2) {
    const angle = ((b.angle ?? 135) * Math.PI) / 180;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.max(canvas.width, canvas.height);
    const dx = (Math.cos(angle) * r) / 2;
    const dy = (Math.sin(angle) * r) / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, b.color);
    g.addColorStop(1, b.color2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(bm, 0, 0);
  bm.close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((out) => resolve(out ?? blob), 'image/png');
  });
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bm, 0, 0, w, h);
  bm.close();
  return canvas.toDataURL('image/jpeg', 0.7);
}
