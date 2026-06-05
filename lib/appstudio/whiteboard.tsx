'use client';

import * as React from 'react';

export type Stroke = { color: string; width: number; pts: number[] };

interface Props {
  strokes: Stroke[];
  onAddStroke: (s: Stroke) => void;
  onClear: () => void;
  height?: number;
}

const COLORS = ['#22d3ee', '#f59e0b', '#a855f7', '#10b981', '#ef4444', '#ffffff'];

export function Whiteboard({ strokes, onAddStroke, onClear, height = 360 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [color, setColor] = React.useState(COLORS[0]);
  const [width, setWidth] = React.useState(3);
  const drawingRef = React.useRef<{ pts: number[] } | null>(null);

  const redraw = React.useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const s of strokes) drawStroke(ctx, s);
  }, [strokes]);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      c.width = c.clientWidth * window.devicePixelRatio;
      c.height = c.clientHeight * window.devicePixelRatio;
      const ctx = c.getContext('2d');
      ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
      redraw();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  React.useEffect(() => { redraw(); }, [redraw]);

  const xy = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const start = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = { pts: xy(e) };
  };
  const move = (e: React.PointerEvent) => {
    const d = drawingRef.current;
    if (!d) return;
    const [x, y] = xy(e);
    d.pts.push(x, y);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawStroke(ctx, { color, width, pts: d.pts });
  };
  const end = () => {
    const d = drawingRef.current;
    if (d && d.pts.length >= 4) onAddStroke({ color, width, pts: d.pts });
    drawingRef.current = null;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className="h-6 w-6 rounded-full ring-2 ring-offset-1 ring-offset-black transition"
            style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }}
          />
        ))}
        <input
          type="range"
          min={1}
          max={20}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="ml-2 w-20"
        />
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ height, touchAction: 'none' }}
        className="w-full cursor-crosshair rounded border border-white/10"
      />
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.pts.length < 4) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.pts[0], s.pts[1]);
  for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
  ctx.stroke();
}
