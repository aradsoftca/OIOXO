'use client';
import * as React from 'react';

interface Props {
  buffer: AudioBuffer;
  width?: number;
  height?: number;
  color?: string;
  selection?: { start: number; end: number } | null;
}

export function Waveform({ buffer, width = 800, height = 96, color = 'var(--color-cat-audio)', selection }: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const data = buffer.getChannelData(0);
    const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
    const mid = height / 2;

    // resolve CSS var
    const resolved = color.startsWith('var(')
      ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() || '#888'
      : color;
    ctx.fillStyle = resolved;

    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      for (let i = 0; i < samplesPerPixel; i++) {
        const v = data[x * samplesPerPixel + i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = mid + min * mid;
      const y2 = mid + max * mid;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    if (selection) {
      const s = (selection.start / buffer.duration) * width;
      const e = (selection.end / buffer.duration) * width;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, s, height);
      ctx.fillRect(e, 0, width - e, height);
      ctx.strokeStyle = resolved;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s + 1, 0); ctx.lineTo(s + 1, height);
      ctx.moveTo(e - 1, 0); ctx.lineTo(e - 1, height);
      ctx.stroke();
    }
  }, [buffer, width, height, color, selection]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block' }}
      className="border border-black/[0.08] bg-[var(--color-canvas)]"
    />
  );
}
