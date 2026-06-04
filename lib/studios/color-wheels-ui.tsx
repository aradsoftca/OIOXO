'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import type { ColorWheelOffset, ColorWheels, RgbCurve, CurveSet } from './color-wheels';
import { IDENTITY_CURVE } from './color-wheels';

export function ColorWheelsPanel({ value, onChange, title = 'Color Wheels' }: {
  value: ColorWheels;
  onChange: (next: ColorWheels) => void;
  title?: string;
}) {
  return (
    <div className="space-y-2 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        <ColorWheel
          label="Shadows"
          offset={value.shadows}
          onChange={o => onChange({ ...value, shadows: o })}
        />
        <ColorWheel
          label="Midtones"
          offset={value.midtones}
          onChange={o => onChange({ ...value, midtones: o })}
        />
        <ColorWheel
          label="Highlights"
          offset={value.highlights}
          onChange={o => onChange({ ...value, highlights: o })}
        />
      </div>
    </div>
  );
}

function ColorWheel({ label, offset, onChange }: { label: string; offset: ColorWheelOffset; onChange: (o: ColorWheelOffset) => void }) {
  const wheelRef = React.useRef<HTMLDivElement | null>(null);
  const dragging = React.useRef(false);

  const maxRadius = 32;
  const maxOffset = 64;
  const x = (offset.r - offset.b) * (maxRadius / maxOffset);
  const y = (offset.r + offset.b - 2 * offset.g) * (maxRadius / maxOffset) * 0.6;

  const onPointerDown: React.PointerEventHandler = (e) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };
  const onPointerMove: React.PointerEventHandler = (e) => {
    if (!dragging.current) return;
    updateFromPointer(e);
  };
  const onPointerUp: React.PointerEventHandler = (e) => {
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const updateFromPointer = (e: React.PointerEvent) => {
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    const newR = Math.round((dx + dy / 0.6) / 2 * (maxOffset / maxRadius));
    const newB = Math.round((-dx + dy / 0.6) / 2 * (maxOffset / maxRadius));
    const newG = Math.round(-(dy / 0.6 / 2) * (maxOffset / maxRadius));
    onChange({ r: newR, g: newG, b: newB, master: offset.master });
  };

  const reset = () => onChange({ r: 0, g: 0, b: 0, master: 0 });

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex w-full items-center justify-between text-[10px] text-zinc-400">
        <span>{label}</span>
        <button onClick={reset} className="text-zinc-500 hover:text-zinc-300" title="Reset">↺</button>
      </div>
      <div
        ref={wheelRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-20 w-20 cursor-crosshair rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), rgba(255,255,255,0) 70%),
                       conic-gradient(from 0deg, #ff4d4d 0deg, #ffe14d 60deg, #4dff7d 120deg, #4de1ff 180deg, #4d6dff 240deg, #ff4dff 300deg, #ff4d4d 360deg)`,
          border: '1px solid rgba(255,255,255,.15)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#fff',
            border: '2px solid #000',
            boxShadow: '0 0 0 1px rgba(255,255,255,.5)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div className="w-full">
        <input
          type="range"
          min={-100}
          max={100}
          value={offset.master}
          onChange={e => onChange({ ...offset, master: parseInt(e.target.value, 10) })}
          className="h-1 w-full"
          title={`Master ${offset.master}`}
        />
      </div>
      <div className="flex w-full justify-between text-[9px] tabular-nums text-zinc-500">
        <span>R{offset.r >= 0 ? '+' : ''}{offset.r}</span>
        <span>G{offset.g >= 0 ? '+' : ''}{offset.g}</span>
        <span>B{offset.b >= 0 ? '+' : ''}{offset.b}</span>
      </div>
    </div>
  );
}

export function RgbCurvesPanel({ value, onChange, title = 'RGB Curves' }: {
  value: CurveSet;
  onChange: (next: CurveSet) => void;
  title?: string;
}) {
  const [channel, setChannel] = React.useState<'master' | 'r' | 'g' | 'b'>('master');
  const curve = value[channel] ?? IDENTITY_CURVE;
  const setCurve = (c: RgbCurve) => onChange({ ...value, [channel]: c });

  return (
    <div className="space-y-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</div>
        <button onClick={() => onChange({})} className="text-[10px] text-zinc-500 hover:text-zinc-300">Reset</button>
      </div>
      <div className="flex gap-1">
        {(['master', 'r', 'g', 'b'] as const).map(c => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[10px] font-medium uppercase',
              channel === c
                ? c === 'master' ? 'bg-white/20 text-white'
                : c === 'r' ? 'bg-rose-500/30 text-rose-200'
                : c === 'g' ? 'bg-emerald-500/30 text-emerald-200'
                : 'bg-blue-500/30 text-blue-200'
                : 'text-zinc-400 hover:bg-white/5',
            )}
          >{c}</button>
        ))}
      </div>
      <CurveEditor
        curve={curve}
        channelColor={channel === 'master' ? '#ffffff' : channel === 'r' ? '#ef4444' : channel === 'g' ? '#22c55e' : '#3b82f6'}
        onChange={setCurve}
      />
    </div>
  );
}

function CurveEditor({ curve, channelColor, onChange }: { curve: RgbCurve; channelColor: string; onChange: (c: RgbCurve) => void }) {
  const ref = React.useRef<SVGSVGElement | null>(null);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);

  const size = 160;

  const toScreen = (p: { x: number; y: number }) => ({
    sx: (p.x / 255) * size,
    sy: size - (p.y / 255) * size,
  });
  const fromScreen = (sx: number, sy: number) => ({
    x: Math.max(0, Math.min(255, Math.round((sx / size) * 255))),
    y: Math.max(0, Math.min(255, Math.round(((size - sy) / size) * 255))),
  });

  const path = (() => {
    const sorted = [...curve.points].sort((a, b) => a.x - b.x);
    const pts = sorted.map(toScreen);
    if (pts.length < 2) return '';
    let d = `M ${pts[0].sx} ${pts[0].sy}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cx = (p0.sx + p1.sx) / 2;
      d += ` Q ${cx} ${p0.sy} ${p1.sx} ${p1.sy}`;
    }
    return d;
  })();

  const onDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setDragIdx(idx);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const { x, y } = fromScreen(sx, sy);
    const next = curve.points.map((p, i) => i === dragIdx ? { x, y } : p);
    onChange({ points: next });
  };

  const onUp = () => setDragIdx(null);

  const onDoubleClick = (e: React.MouseEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const { x, y } = fromScreen(sx, sy);
    onChange({ points: [...curve.points, { x, y }].sort((a, b) => a.x - b.x) });
  };

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="w-full rounded border border-white/10 bg-[#0a0b0e] cursor-crosshair"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={onDoubleClick}
    >
      <line x1={0} y1={0} x2={size} y2={size} stroke="rgba(255,255,255,.1)" strokeDasharray="2 4" />
      {[0.25, 0.5, 0.75].map(g => (
        <React.Fragment key={g}>
          <line x1={size * g} y1={0} x2={size * g} y2={size} stroke="rgba(255,255,255,.05)" />
          <line x1={0} y1={size * g} x2={size} y2={size * g} stroke="rgba(255,255,255,.05)" />
        </React.Fragment>
      ))}
      <path d={path} stroke={channelColor} strokeWidth={2} fill="none" />
      {curve.points.map((p, i) => {
        const { sx, sy } = toScreen(p);
        return (
          <circle
            key={i}
            cx={sx}
            cy={sy}
            r={4}
            fill="#fff"
            stroke={channelColor}
            strokeWidth={2}
            onPointerDown={onDown(i)}
            style={{ cursor: 'grab', touchAction: 'none' }}
          />
        );
      })}
    </svg>
  );
}
