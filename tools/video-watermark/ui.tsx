'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpegMulti, downloadBlob } from '@/engines/ffmpeg';

interface Pos { id: string; label: string; expr: string; }
const POSITIONS: Pos[] = [
  { id: 'tl', label: 'Top-left',     expr: '20:20' },
  { id: 'tr', label: 'Top-right',    expr: 'W-w-20:20' },
  { id: 'bl', label: 'Bottom-left',  expr: '20:H-h-20' },
  { id: 'br', label: 'Bottom-right', expr: 'W-w-20:H-h-20' },
  { id: 'c',  label: 'Center',       expr: '(W-w)/2:(H-h)/2' },
];

function renderTextPng(text: string, fontSize: number, opacity: number, color: string): Promise<Blob> {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  const m = ctx.measureText(text);
  const padding = Math.ceil(fontSize * 0.4);
  const w = Math.ceil(m.width + padding * 2);
  const h = Math.ceil(fontSize * 1.4 + padding * 2);
  c.width = w; c.height = h;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, padding + 2, h / 2 + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, padding, h / 2);
  return new Promise((resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error('Could not render watermark')), 'image/png'));
}

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [text, setText] = React.useState('© Your Brand');
  const [fontSize, setFontSize] = React.useState(48);
  const [opacity, setOpacity] = React.useState(0.85);
  const [color, setColor] = React.useState('#ffffff');
  const [pos, setPos] = React.useState(POSITIONS[3]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item || !text.trim()) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const wmBlob = await renderTextPng(text, fontSize, opacity, color);
      const inputExt = item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4';
      const blob = await runFfmpegMulti({
        inputs: [
          { name: 'in.' + inputExt, data: item.file },
          { name: 'wm.png', data: wmBlob },
        ],
        outputName: 'out.mp4',
        args: (ins, o) => ['-i', ins[0], '-i', ins[1], '-filter_complex', `[0:v][1:v]overlay=${pos.expr}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-watermark.mp4');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height} · {fmtDuration(item.info.duration)}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Watermark text</div>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-video)]" />
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Font size</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">{fontSize}px</span>
                  </div>
                  <Slider.Root value={[fontSize]} min={16} max={120} step={2}
                    onValueChange={([v]) => setFontSize(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                  </Slider.Root>
                </div>
                <label className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Color</span>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                    className="mt-1 h-9 w-12 cursor-pointer border-0 bg-transparent" />
                </label>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Opacity</span>
                  <span className="font-mono text-[14px] tabular-nums font-bold">{Math.round(opacity * 100)}%</span>
                </div>
                <Slider.Root value={[opacity]} min={0.2} max={1} step={0.05}
                  onValueChange={([v]) => setOpacity(v)}
                  className="relative mt-2 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-video)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-video)]" />
                </Slider.Root>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Position</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {POSITIONS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPos(p)}
                      className={`border py-2 text-[10px] font-bold transition ${pos.id === p.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Stamp & Download" busyLabel="Stamping…" onClick={run} disabled={!text.trim()} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
