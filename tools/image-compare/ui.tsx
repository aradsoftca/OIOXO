'use client';

import * as React from 'react';
import { Upload, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';

type Mode = 'slider' | 'side';

interface Slot { url: string; name: string }

function DropSlot({ slot, label, onLoad }: { slot: Slot | null; label: string; onLoad: (f: File) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onLoad(f); }}
      onDragOver={(e) => e.preventDefault()}
      className="flex aspect-square items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
    >
      {slot ? (
        <button type="button" onClick={() => ref.current?.click()} className="relative h-full w-full">
          <img src={slot.url} alt={label} className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{label}</span>
        </button>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} className="flex flex-col items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
          <Upload className="h-5 w-5" />
          Drop {label}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoad(f); }} />
    </div>
  );
}

export default function ImageCompareTool() {
  const [a, setA] = React.useState<Slot | null>(null);
  const [b, setB] = React.useState<Slot | null>(null);
  const [mode, setMode] = React.useState<Mode>('slider');
  const [pos, setPos] = React.useState(50);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef(false);

  React.useEffect(() => () => { if (a) URL.revokeObjectURL(a.url); if (b) URL.revokeObjectURL(b.url); }, [a, b]);

  const loadA = (f: File) => { if (a) URL.revokeObjectURL(a.url); setA({ url: URL.createObjectURL(f), name: f.name }); };
  const loadB = (f: File) => { if (b) URL.revokeObjectURL(b.url); setB({ url: URL.createObjectURL(f), name: f.name }); };

  const move = (clientX: number) => {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  if (!a || !b) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--color-fg-muted)]">Drop two images to compare them.</p>
        <div className="grid grid-cols-2 gap-3">
          <DropSlot slot={a} label="Image A" onLoad={loadA} />
          <DropSlot slot={b} label="Image B" onLoad={loadB} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex border border-black/[0.08]">
          {(['slider', 'side'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn('px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition',
                mode === m ? 'bg-[var(--color-cat-image)] text-white' : 'text-[var(--color-fg-muted)]')}>
              {m === 'slider' ? 'Slider' : 'Side by side'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setA(null); setB(null); }}
          className="ml-auto flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1.5 text-[11px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
          <RefreshCw className="h-3 w-3" /> New pair
        </button>
      </div>

      {mode === 'slider' ? (
        <div
          ref={stageRef}
          onPointerDown={(e) => { dragRef.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX); }}
          onPointerMove={(e) => { if (dragRef.current) move(e.clientX); }}
          onPointerUp={(e) => { dragRef.current = false; (e.target as HTMLElement).releasePointerCapture(e.pointerId); }}
          className="relative aspect-[4/3] cursor-ew-resize touch-none select-none overflow-hidden border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:24px_24px]"
        >
          <img src={a.url} alt="A" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            <img src={b.url} alt="B" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          </div>
          <div className="absolute top-0 bottom-0 z-10" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>
            <div className="h-full w-0.5 bg-white shadow-[0_0_0_1px_oklch(0%_0_0/0.4)]" />
            <div className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-black shadow-lg">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
          </div>
          <span className="absolute left-2 top-2 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">A</span>
          <span className="absolute right-2 top-2 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">B</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[a, b].map((s, i) => (
            <div key={i} className="relative aspect-square overflow-hidden border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:20px_20px]">
              <img src={s.url} alt={i ? 'B' : 'A'} className="absolute inset-0 h-full w-full object-contain" />
              <span className="absolute left-2 top-2 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{i ? 'B' : 'A'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
