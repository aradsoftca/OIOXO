'use client';
import * as React from 'react';
import { decode, encode, type ImageFormat } from '@/engines/image';
import { cn } from '@/lib/cn';
import { useImageDrop } from '@/lib/compute/useImageDrop';

interface Aspect { id: string; label: string; ratio: number | null; }
const ASPECTS: Aspect[] = [
  { id: 'free',     label: 'Free',       ratio: null },
  { id: '1-1',      label: '1:1',        ratio: 1 },
  { id: '4-5',      label: '4:5',        ratio: 4 / 5 },
  { id: '3-4',      label: '3:4',        ratio: 3 / 4 },
  { id: '2-3',      label: '2:3',        ratio: 2 / 3 },
  { id: '9-16',     label: '9:16',       ratio: 9 / 16 },
  { id: '16-9',     label: '16:9',       ratio: 16 / 9 },
  { id: '3-2',      label: '3:2',        ratio: 3 / 2 },
  { id: '4-3',      label: '4:3',        ratio: 4 / 3 },
];

type Drag = { kind: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'new'; startX: number; startY: number; box: Box };
interface Box { x: number; y: number; w: number; h: number; }

function clampBox(b: Box, W: number, H: number): Box {
  const x = Math.max(0, Math.min(W - 1, b.x));
  const y = Math.max(0, Math.min(H - 1, b.y));
  const w = Math.max(1, Math.min(W - x, b.w));
  const h = Math.max(1, Math.min(H - y, b.h));
  return { x, y, w, h };
}

function applyRatio(b: Box, W: number, H: number, ratio: number | null): Box {
  if (!ratio) return clampBox(b, W, H);
  let { x, y, w, h } = b;
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  return clampBox({ x, y, w, h }, W, H);
}

export default function Tool() {
  const [src, setSrc] = React.useState<{ file: File; url: string; data: ImageData } | null>(null);
  const [aspect, setAspect] = React.useState(ASPECTS[0]);
  const [box, setBox] = React.useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [format, setFormat] = React.useState<ImageFormat>('png');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<Drag | null>(null);

  React.useEffect(() => () => { if (src?.url) URL.revokeObjectURL(src.url); }, [src]);

  const loadFile = async (file: File) => {
    setError(''); setBusy(true);
    try {
      const { data } = await decode(file);
      const url = URL.createObjectURL(file);
      setSrc({ file, url, data });
      // Default crop = 80% center
      const cw = Math.round(data.width * 0.8);
      const ch = Math.round(data.height * 0.8);
      setBox({ x: Math.round((data.width - cw) / 2), y: Math.round((data.height - ch) / 2), w: cw, h: ch });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  React.useEffect(() => {
    if (!src) return;
    setBox((b) => applyRatio(b, src.data.width, src.data.height, aspect.ratio));
  }, [aspect, src]);

  const onPointerDown = (e: React.PointerEvent, kind: Drag['kind']) => {
    if (!src || !stageRef.current) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const stageRect = stageRef.current.getBoundingClientRect();
    const scale = src.data.width / stageRect.width;
    dragRef.current = { kind, startX: e.clientX * scale, startY: e.clientY * scale, box: { ...box } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!src || !stageRef.current || !dragRef.current) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    const scale = src.data.width / stageRect.width;
    const x = e.clientX * scale, y = e.clientY * scale;
    const dx = x - dragRef.current.startX;
    const dy = y - dragRef.current.startY;
    const { box: b0, kind } = dragRef.current;
    let nb: Box = { ...b0 };
    if (kind === 'move') {
      nb = { x: b0.x + dx, y: b0.y + dy, w: b0.w, h: b0.h };
    } else {
      const handles = {
        nw: { dx: 1, dy: 1, fx: -1, fy: -1 },
        n:  { dx: 0, dy: 1, fx: 0,  fy: -1 },
        ne: { dx: 0, dy: 1, fx: 1,  fy: -1 },
        e:  { dx: 0, dy: 0, fx: 1,  fy: 0  },
        se: { dx: 0, dy: 0, fx: 1,  fy: 1  },
        s:  { dx: 0, dy: 0, fx: 0,  fy: 1  },
        sw: { dx: 1, dy: 0, fx: -1, fy: 1  },
        w:  { dx: 1, dy: 0, fx: -1, fy: 0  },
        new: { dx: 0, dy: 0, fx: 0, fy: 0 },
      } as const;
      const h = handles[kind];
      nb = { x: b0.x + dx * h.dx, y: b0.y + dy * h.dy, w: Math.max(1, b0.w + dx * h.fx), h: Math.max(1, b0.h + dy * h.fy) };
    }
    setBox(applyRatio(nb, src.data.width, src.data.height, aspect.ratio));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const exportCrop = async () => {
    if (!src) return;
    setBusy(true); setError('');
    try {
      const { x, y, w, h } = box;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const ctx = canvas.getContext('2d')!;
      const tmp = document.createElement('canvas');
      tmp.width = src.data.width; tmp.height = src.data.height;
      tmp.getContext('2d')!.putImageData(src.data, 0, 0);
      ctx.drawImage(tmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
      const cropped = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { blob } = await encode(cropped, format);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = src.file.name.replace(/\.[^.]+$/, '') + '-cropped.' + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const clear = React.useCallback(() => {
    setSrc((s) => { if (s?.url) URL.revokeObjectURL(s.url); return null; });
    setError('');
  }, []);

  // Enter runs the latest export closure; mirror through a ref so we don't reorder.
  const exportRef = React.useRef<() => void>(() => {});
  exportRef.current = () => { void exportCrop(); };

  // Clipboard paste (screenshot → crop), drag-anywhere hover state,
  // Esc to clear, Enter to crop & download.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: src ? clear : undefined,
    onRun: src && !busy ? () => exportRef.current() : undefined,
  });

  return (
    <div className="space-y-4">
      {!src && (
        <label className="block" {...dropZone}>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
          <div className={cn(
            'cursor-pointer border border-dashed bg-[var(--color-surface-1)] p-12 text-center transition',
            dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.18] hover:border-[var(--color-cat-image)]',
          )}>
            <div className="text-[14px] font-bold">{dragging ? 'Drop to crop' : 'Drop, paste or click to crop'}</div>
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

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-black/[0.02] p-2">
              <div
                ref={stageRef}
                className="relative mx-auto select-none touch-none"
                style={{ maxWidth: '100%', aspectRatio: `${src.data.width} / ${src.data.height}` }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <img src={src.url} alt="" className="absolute inset-0 h-full w-full object-contain pointer-events-none" />
                <div
                  className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
                  style={{
                    left: `${(box.x / src.data.width) * 100}%`,
                    top: `${(box.y / src.data.height) * 100}%`,
                    width: `${(box.w / src.data.width) * 100}%`,
                    height: `${(box.h / src.data.height) * 100}%`,
                  }}
                  onPointerDown={(e) => onPointerDown(e, 'move')}
                >
                  {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((k) => (
                    <div key={k}
                      onPointerDown={(e) => onPointerDown(e, k)}
                      className="absolute h-3 w-3 -m-1.5 bg-white border border-black/40"
                      style={{
                        left: k.includes('w') ? '0' : k.includes('e') ? '100%' : '50%',
                        top:  k.includes('n') ? '0' : k.includes('s') ? '100%' : '50%',
                        cursor: { nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize', n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize' }[k],
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Aspect ratio</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {ASPECTS.map((a) => (
                    <button key={a.id} type="button" onClick={() => setAspect(a)}
                      className={`border py-2 text-[11px] font-bold transition ${aspect.id === a.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Crop region</div>
                <div className="mt-1 font-mono text-[14px] tabular-nums font-bold">{Math.round(box.w)}×{Math.round(box.h)}</div>
                <div className="font-mono text-[10px] text-[var(--color-fg-muted)]">at {Math.round(box.x)}, {Math.round(box.y)}</div>
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

              <button type="button" onClick={exportCrop} disabled={busy}
                className="w-full bg-[var(--color-cat-image)] text-white py-3 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
                {busy ? 'Working…' : 'Crop & Download'}
              </button>
              {error && <div className="text-[11px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
