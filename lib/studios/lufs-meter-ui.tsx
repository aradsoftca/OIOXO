'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { LufsMeter, lufsBandColor, type LufsReading } from './lufs-meter';

export function LufsMeterDisplay({ meterRef, targetLufs = -16, title = 'LUFS Meter' }: {
  meterRef: React.MutableRefObject<LufsMeter | null>;
  targetLufs?: number;
  title?: string;
}) {
  const [reading, setReading] = React.useState<LufsReading | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const meter = meterRef.current;
      if (meter) setReading(meter.read());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meterRef]);

  const fmt = (v: number) => isFinite(v) ? v.toFixed(1) : '—';

  return (
    <div className="space-y-1.5 rounded border border-white/10 bg-[#0a0b0e] p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{title}</span>
        <span className="text-[9px] text-zinc-500">target {targetLufs} LUFS</span>
      </div>
      <BarMeter label="M" db={reading?.momentary ?? -Infinity} target={targetLufs} />
      <BarMeter label="S" db={reading?.shortTerm ?? -Infinity} target={targetLufs} />
      <BarMeter label="I" db={reading?.integrated ?? -Infinity} target={targetLufs} integrated />
      <div className="flex items-center justify-between rounded bg-white/[.02] px-1.5 py-1">
        <span className="text-[9px] text-zinc-500">True Peak</span>
        <span className={cn(
          'text-[10px] tabular-nums font-bold',
          (reading?.truePeak ?? -Infinity) > -1 ? 'text-rose-300' : (reading?.truePeak ?? -Infinity) > -3 ? 'text-amber-300' : 'text-emerald-300',
        )}>{fmt(reading?.truePeak ?? -Infinity)} dBFS</span>
      </div>
    </div>
  );
}

function BarMeter({ label, db, target, integrated }: { label: string; db: number; target: number; integrated?: boolean }) {
  const min = -40;
  const max = 0;
  const pct = !isFinite(db) ? 0 : Math.max(0, Math.min(1, (db - min) / (max - min)));
  const color = lufsBandColor(db, target);
  const fmt = (v: number) => isFinite(v) ? v.toFixed(1) : '—';
  const targetPct = (target - min) / (max - min);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase text-zinc-500">{label}</span>
        <span className={cn('text-[10px] tabular-nums font-bold', integrated && 'text-cyan-300')}>{fmt(db)}</span>
      </div>
      <div className="relative h-2 rounded-sm bg-white/5 overflow-hidden">
        <div className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${pct * 100}%`, background: color }} />
        <div className="absolute top-0 bottom-0 w-px bg-cyan-300/60" style={{ left: `${targetPct * 100}%` }} />
      </div>
    </div>
  );
}

export function SpectrogramView({ audioBuffer, width = 280, height = 80 }: { audioBuffer: AudioBuffer | null; width?: number; height?: number }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !audioBuffer) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, width, height);

    const data = audioBuffer.getChannelData(0);
    const windowSize = 512;
    const hop = Math.floor(data.length / width);
    const real = new Float32Array(windowSize);
    const imag = new Float32Array(windowSize);

    for (let x = 0; x < width; x++) {
      const offset = x * hop;
      for (let i = 0; i < windowSize; i++) {
        const v = data[offset + i] ?? 0;
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
        real[i] = v * w;
        imag[i] = 0;
      }
      fft(real, imag);
      for (let y = 0; y < height; y++) {
        const bin = Math.floor((1 - y / height) * (windowSize / 2));
        const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
        const intensity = Math.min(1, Math.log10(1 + mag * 50) / 2);
        const hue = (1 - intensity) * 240;
        ctx.fillStyle = `hsl(${hue.toFixed(0)},80%,${(intensity * 50).toFixed(0)}%)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [audioBuffer, width, height]);

  if (!audioBuffer) return <div className="h-20 rounded border border-dashed border-white/10 grid place-items-center text-[10px] text-zinc-500">Select a clip to see spectrogram</div>;
  return <canvas ref={ref} className="w-full rounded border border-white/10" />;
}

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const tReal = curReal * real[i + k + len / 2] - curImag * imag[i + k + len / 2];
        const tImag = curReal * imag[i + k + len / 2] + curImag * real[i + k + len / 2];
        real[i + k + len / 2] = real[i + k] - tReal;
        imag[i + k + len / 2] = imag[i + k] - tImag;
        real[i + k] += tReal;
        imag[i + k] += tImag;
        const newReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newReal;
      }
    }
  }
}
