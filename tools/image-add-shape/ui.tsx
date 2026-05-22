'use client';

import * as React from 'react';
import { Upload, Download, Trash2, Undo2, Square, Circle, ArrowRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tool = 'rect' | 'circle' | 'arrow' | 'line';
type Format = 'png' | 'jpeg';

interface Shape {
  kind: Tool;
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  width: number;
  fill: boolean;
}

const TOOLS: { id: Tool; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rect',   label: 'Rect',   Icon: Square },
  { id: 'circle', label: 'Circle', Icon: Circle },
  { id: 'arrow',  label: 'Arrow',  Icon: ArrowRight },
  { id: 'line',   label: 'Line',   Icon: Minus },
];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const { x1, y1, x2, y2 } = s;
  if (s.kind === 'rect') {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (s.fill) ctx.fillRect(x, y, w, h);
    else ctx.strokeRect(x, y, w, h);
  } else if (s.kind === 'circle') {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const r = Math.hypot(x2 - x1, y2 - y1) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (s.fill) ctx.fill();
    else ctx.stroke();
  } else if (s.kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (s.kind === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(12, s.width * 4);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(ang - Math.PI / 6), y2 - headLen * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(ang + Math.PI / 6), y2 - headLen * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
}

export default function ImageAddShapeTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [tool, setTool] = React.useState<Tool>('rect');
  const [color, setColor] = React.useState('#ef4444');
  const [width, setWidth] = React.useState(6);
  const [fill, setFill] = React.useState(false);
  const [format, setFormat] = React.useState<Format>('png');
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [draft, setDraft] = React.useState<Shape | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { bitmap?.close(); }, [bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
    setShapes([]);
  };

  const render = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    for (const s of shapes) drawShape(ctx, s);
    if (draft) drawShape(ctx, draft);
  }, [bitmap, shapes, draft]);

  React.useEffect(() => { render(); }, [render]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFromEvent(e);
    setDraft({ kind: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width, fill });
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const p = pointFromEvent(e);
    setDraft({ ...draft, x2: p.x, y2: p.y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const p = pointFromEvent(e);
    const final = { ...draft, x2: p.x, y2: p.y };
    if (Math.hypot(final.x2 - final.x1, final.y2 - final.y1) > 2) {
      setShapes((prev) => [...prev, final]);
    }
    setDraft(null);
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  };

  const undo = () => setShapes((prev) => prev.slice(0, -1));
  const clear = () => setShapes([]);

  const download = () => {
    if (!file || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-annotated.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
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
              Drop a screenshot or click to browse
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
          </div>
        ) : (
          <div className="overflow-hidden border border-black/[0.08] bg-black/5">
            <canvas ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="block h-auto w-full cursor-crosshair touch-none" />
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Tool</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {TOOLS.map((t) => {
              const Icon = t.Icon;
              return (
                <button key={t.id} type="button" onClick={() => setTool(t.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 border py-2 text-[10px] font-bold uppercase tracking-wider transition',
                    tool === t.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]',
                  )}>
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
            <div className="ml-auto flex gap-1">
              {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#000000', '#ffffff'].map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className="h-6 w-6 border border-black/[0.12]"
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Stroke width</span>
              <span className="font-mono text-[12px] tabular-nums">{width}px</span>
            </div>
            <input type="range" min={1} max={40} step={1} value={width}
              onChange={(e) => setWidth(parseInt(e.target.value, 10))}
              className="mt-2 w-full" />
          </div>
          {(tool === 'rect' || tool === 'circle') && (
            <label className="flex items-center justify-between text-[11px] text-[var(--color-fg)]">
              <span className="font-medium">Filled</span>
              <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="h-4 w-4" />
            </label>
          )}
        </div>

        {file && (
          <>
            <div className="flex gap-1.5">
              <button type="button" onClick={undo} disabled={!shapes.length}
                className="flex flex-1 items-center justify-center gap-1.5 border border-black/[0.08] py-2 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                <Undo2 className="h-3 w-3" />
                Undo
              </button>
              <button type="button" onClick={clear} disabled={!shapes.length}
                className="flex flex-1 items-center justify-center gap-1.5 border border-black/[0.08] py-2 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
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
          </>
        )}
      </aside>
    </div>
  );
}
