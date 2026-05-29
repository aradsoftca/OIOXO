'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';

type Style = 'bars' | 'mirror' | 'filled';

const PRESETS: { label: string; fg: string; bg: string }[] = [
  { label: 'Onyx',    fg: '#ffffff',           bg: '#0a0a0a' },
  { label: 'Paper',   fg: '#0a0a0a',           bg: '#ffffff' },
  { label: 'Cobalt',  fg: '#e0e7ff',           bg: '#0f172a' },
  { label: 'Ember',   fg: '#fb7185',           bg: '#1f1d1c' },
  { label: 'Mint',    fg: '#10b981',           bg: '#0a0f0d' },
  { label: 'Gold',    fg: '#f59e0b',           bg: '#1c1917' },
];

function aggregate(data: Float32Array, columns: number): { min: number; max: number }[] {
  const result: { min: number; max: number }[] = [];
  const samplesPerColumn = Math.max(1, Math.floor(data.length / columns));
  for (let x = 0; x < columns; x++) {
    let mn = 1, mx = -1;
    const start = x * samplesPerColumn;
    const end = Math.min(data.length, start + samplesPerColumn);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    result.push({ min: Math.max(-1, mn), max: Math.min(1, mx) });
  }
  return result;
}

function renderToCanvas(canvas: HTMLCanvasElement, item: AudioFileItem, style: Style, fg: string, bg: string, width: number, height: number, barWidth: number, gap: number) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const data = item.buffer.getChannelData(0);
  const step = barWidth + gap;
  const columns = Math.floor(width / step);
  const agg = aggregate(data, columns);
  const mid = height / 2;

  ctx.fillStyle = fg;
  if (style === 'bars') {
    for (let i = 0; i < columns; i++) {
      const peak = Math.max(Math.abs(agg[i].min), Math.abs(agg[i].max));
      const h = Math.max(2, peak * height);
      const y = mid - h / 2;
      ctx.fillRect(i * step, y, barWidth, h);
    }
  } else if (style === 'mirror') {
    for (let i = 0; i < columns; i++) {
      const peak = Math.max(Math.abs(agg[i].min), Math.abs(agg[i].max));
      const h = Math.max(1, peak * mid);
      ctx.fillRect(i * step, mid - h, barWidth, h);
      ctx.fillRect(i * step, mid, barWidth, h);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < columns; i++) ctx.lineTo(i * step + barWidth / 2, mid + agg[i].max * mid);
    for (let i = columns - 1; i >= 0; i--) ctx.lineTo(i * step + barWidth / 2, mid + agg[i].min * mid);
    ctx.closePath();
    ctx.fill();
  }
}

function renderToSvg(item: AudioFileItem, style: Style, fg: string, bg: string, width: number, height: number, barWidth: number, gap: number): string {
  const data = item.buffer.getChannelData(0);
  const step = barWidth + gap;
  const columns = Math.floor(width / step);
  const agg = aggregate(data, columns);
  const mid = height / 2;
  const rects: string[] = [];
  if (style === 'bars') {
    for (let i = 0; i < columns; i++) {
      const peak = Math.max(Math.abs(agg[i].min), Math.abs(agg[i].max));
      const h = Math.max(2, peak * height);
      rects.push(`<rect x="${(i * step).toFixed(1)}" y="${(mid - h / 2).toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" />`);
    }
  } else if (style === 'mirror') {
    for (let i = 0; i < columns; i++) {
      const peak = Math.max(Math.abs(agg[i].min), Math.abs(agg[i].max));
      const h = Math.max(1, peak * mid);
      rects.push(`<rect x="${(i * step).toFixed(1)}" y="${(mid - h).toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" />`);
      rects.push(`<rect x="${(i * step).toFixed(1)}" y="${mid.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" />`);
    }
  } else {
    const pts: string[] = [];
    pts.push(`0,${mid.toFixed(1)}`);
    for (let i = 0; i < columns; i++) pts.push(`${(i * step + barWidth / 2).toFixed(1)},${(mid + agg[i].max * mid).toFixed(1)}`);
    for (let i = columns - 1; i >= 0; i--) pts.push(`${(i * step + barWidth / 2).toFixed(1)},${(mid + agg[i].min * mid).toFixed(1)}`);
    rects.push(`<polygon points="${pts.join(' ')}" />`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}" /><g fill="${fg}">${rects.join('')}</g></svg>`;
}

export default function AudioWaveformTool() {
  const [item, setItem] = React.useState<AudioFileItem | null>(null);
  const [style, setStyle] = React.useState<Style>('mirror');
  const [presetIdx, setPresetIdx] = React.useState(0);
  const [customFg, setCustomFg] = React.useState<string | null>(null);
  const [customBg, setCustomBg] = React.useState<string | null>(null);
  const [width, setWidth] = React.useState(1600);
  const [height, setHeight] = React.useState(400);
  const [barWidth, setBarWidth] = React.useState(3);
  const [gap, setGap] = React.useState(1);
  const previewRef = React.useRef<HTMLCanvasElement>(null);

  const fg = customFg ?? PRESETS[presetIdx].fg;
  const bg = customBg ?? PRESETS[presetIdx].bg;

  React.useEffect(() => {
    if (!item) return;
    const canvas = previewRef.current;
    if (!canvas) return;
    renderToCanvas(canvas, item, style, fg, bg, 800, 200, Math.max(1, Math.floor(barWidth / 2)), Math.max(0, Math.floor(gap / 2)));
  }, [item, style, fg, bg, barWidth, gap]);

  const downloadPng = () => {
    if (!item) return;
    const canvas = document.createElement('canvas');
    renderToCanvas(canvas, item, style, fg, bg, width, height, barWidth, gap);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = item.file.name.replace(/\.[^.]+$/, '') + '-waveform.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, 'image/png');
  };

  const downloadSvg = () => {
    if (!item) return;
    const svg = renderToSvg(item, style, fg, bg, width, height, barWidth, gap);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = item.file.name.replace(/\.[^.]+$/, '') + '-waveform.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <div className="space-y-4">
      {!item && <AudioDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.duration.toFixed(2)}s</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change file
            </button>
          </div>

          <div className="overflow-hidden border border-black/[0.08]" style={{ background: bg }}>
            <canvas ref={previewRef} className="block w-full" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Style</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(['bars', 'mirror', 'filled'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setStyle(s)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${style === s ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Theme</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {PRESETS.map((p, i) => (
                    <button key={p.label} type="button"
                      onClick={() => { setPresetIdx(i); setCustomFg(null); setCustomBg(null); }}
                      className={`relative h-12 border text-[10px] font-bold uppercase tracking-wider transition ${presetIdx === i && !customFg && !customBg ? 'border-[var(--color-fg)]' : 'border-black/[0.08]'}`}
                      style={{ background: p.bg, color: p.fg }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                    Bars
                    <input type="color" value={fg} onChange={(e) => setCustomFg(e.target.value)}
                      className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                    Background
                    <input type="color" value={bg} onChange={(e) => setCustomBg(e.target.value)}
                      className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
                  </label>
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
                {[
                  { label: 'Width', value: width, set: setWidth, min: 400, max: 4000, step: 100 },
                  { label: 'Height', value: height, set: setHeight, min: 100, max: 1200, step: 20 },
                  { label: 'Bar width', value: barWidth, set: setBarWidth, min: 1, max: 12, step: 1 },
                  { label: 'Bar gap', value: gap, set: setGap, min: 0, max: 8, step: 1 },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{s.label}</span>
                      <span className="font-mono text-[12px] tabular-nums">{s.value}{s.label.includes('idth') || s.label === 'Height' ? 'px' : ''}</span>
                    </div>
                    <Slider.Root value={[s.value]} min={s.min} max={s.max} step={s.step}
                      onValueChange={([v]) => s.set(v)}
                      className="relative mt-2 flex h-5 w-full touch-none items-center">
                      <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                        <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                      </Slider.Track>
                      <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
                    </Slider.Root>
                  </div>
                ))}
              </div>

              <button type="button" onClick={downloadPng}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </button>
              <button type="button" onClick={downloadSvg}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
                <Download className="h-3.5 w-3.5" />
                Download SVG
              </button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
