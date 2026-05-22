'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { FfmpegRunButton } from '@/components/tool/FfmpegRunButton';
import { fmtDuration } from '@/engines/video';
import { runFfmpegMulti, downloadBlob } from '@/engines/ffmpeg';

interface Pos { id: string; label: string; expr: string; }
const POSITIONS: Pos[] = [
  { id: 'top',    label: 'Top',    expr: '(W-w)/2:40' },
  { id: 'mid',    label: 'Middle', expr: '(W-w)/2:(H-h)/2' },
  { id: 'bot',    label: 'Bottom', expr: '(W-w)/2:H-h-40' },
];

function renderTextPng(text: string, fontSize: number, color: string, bgEnabled: boolean): Promise<Blob> {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const m = ctx.measureText(text);
  const pad = Math.ceil(fontSize * 0.5);
  const w = Math.ceil(m.width + pad * 2);
  const h = Math.ceil(fontSize * 1.5 + pad * 2);
  c.width = w; c.height = h;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (bgEnabled) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);
  } else {
    // shadow for legibility on any background
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = Math.max(4, fontSize * 0.1);
    ctx.shadowOffsetY = 2;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [text, setText] = React.useState('Your Title');
  const [fontSize, setFontSize] = React.useState(72);
  const [color, setColor] = React.useState('#ffffff');
  const [pos, setPos] = React.useState(POSITIONS[2]);
  const [bgEnabled, setBgEnabled] = React.useState(false);
  const [startSec, setStartSec] = React.useState(0);
  const [durSec, setDurSec] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item || !text.trim()) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const pngBlob = await renderTextPng(text, fontSize, color, bgEnabled);
      const inputExt = item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4';
      const endSec = durSec !== null ? startSec + durSec : item.info.duration;
      const enableExpr = `between(t,${startSec.toFixed(2)},${endSec.toFixed(2)})`;
      const blob = await runFfmpegMulti({
        inputs: [
          { name: 'in.' + inputExt, data: item.file },
          { name: 'txt.png', data: pngBlob },
        ],
        outputName: 'out.mp4',
        args: (ins, o) => ['-i', ins[0], '-i', ins[1], '-filter_complex', `[0:v][1:v]overlay=${pos.expr}:enable='${enableExpr}'`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', o],
        mimeType: 'video/mp4',
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '-titled.mp4');
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
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Text</div>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-video)]" />
              </label>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Font size</span>
                    <span className="font-mono text-[14px] tabular-nums font-bold">{fontSize}px</span>
                  </div>
                  <Slider.Root value={[fontSize]} min={20} max={200} step={2}
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
                <label className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">BG</span>
                  <input type="checkbox" checked={bgEnabled} onChange={(e) => setBgEnabled(e.target.checked)}
                    className="h-5 w-5 accent-[var(--color-cat-video)]" />
                </label>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Position</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {POSITIONS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPos(p)}
                      className={`border py-2 text-[11px] font-bold transition ${pos.id === p.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Start (s)</div>
                  <input type="number" value={startSec} min={0} max={item.info.duration} step={0.1}
                    onChange={(e) => setStartSec(Math.max(0, Math.min(item.info.duration, Number(e.target.value))))}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-video)]" />
                </label>
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Duration (s, blank = full)</div>
                  <input type="number" value={durSec ?? ''} min={0.1} step={0.1}
                    placeholder="full"
                    onChange={(e) => setDurSec(e.target.value === '' ? null : Number(e.target.value))}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-video)]" />
                </label>
              </div>
            </div>
            <aside>
              <FfmpegRunButton gateCategory="video" colorVar="--color-cat-video" busy={busy} progress={progress} label="Add Text & Download" busyLabel="Rendering…" onClick={run} disabled={!text.trim()} error={error} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
