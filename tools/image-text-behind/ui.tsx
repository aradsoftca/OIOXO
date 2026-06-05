'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download, Wand2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { removeBackground } from '@/engines/image';
import { useImageDrop } from '@/lib/compute/useImageDrop';

const FONTS = [
  { label: 'Sans', css: '700 1px Arial, sans-serif' },
  { label: 'Serif', css: '700 1px Georgia, serif' },
  { label: 'Mono', css: '700 1px "Courier New", monospace' },
  { label: 'Heavy', css: '900 1px "Arial Black", Arial, sans-serif' },
];

export default function TextBehindTool() {
  const [bg, setBg] = React.useState<ImageBitmap | null>(null);
  const [subject, setSubject] = React.useState<ImageBitmap | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ phase: string; ratio: number } | null>(null);

  const [text, setText] = React.useState('BEHIND');
  const [size, setSize] = React.useState(28);          // % of image height
  const [posX, setPosX] = React.useState(50);          // %
  const [posY, setPosY] = React.useState(50);          // %
  const [rotation, setRotation] = React.useState(0);   // deg
  const [color, setColor] = React.useState('#ffffff');
  const [opacity, setOpacity] = React.useState(100);
  const [fontIdx, setFontIdx] = React.useState(3);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Unmount-only. With [bg, subject] in the deps, changing bg also closed
  // the still-in-use `subject` bitmap (and vice versa). loadFile already
  // closes the prior bitmaps inline via the setBg/setSubject updater form.
  const bgRef = React.useRef<ImageBitmap | null>(null);
  const subjectRef = React.useRef<ImageBitmap | null>(null);
  React.useEffect(() => { bgRef.current = bg; subjectRef.current = subject; }, [bg, subject]);
  React.useEffect(() => () => {
    bgRef.current?.close();
    subjectRef.current?.close();
  }, []);

  const loadFile = React.useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setRunning(true);
    setProgress({ phase: 'Reading image', ratio: 0 });
    try {
      const original = await createImageBitmap(file);
      setBg((prev) => { prev?.close(); return original; });
      // Isolate the subject (transparent background PNG), same dimensions.
      const cut = await removeBackground(file, { quality: 'balanced', format: 'image/png', onProgress: (p) => setProgress(p) });
      const subjBm = await createImageBitmap(cut);
      setSubject((prev) => { prev?.close(); return subjBm; });
    } catch (e) {
      console.error('text-behind failed', e);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, []);

  // Re-composite whenever any control changes.
  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bg) return;
    canvas.width = bg.width;
    canvas.height = bg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0);                       // 1. background photo

    if (text.trim()) {                              // 2. text layer
      const px = (size / 100) * bg.height;
      ctx.save();
      ctx.translate((posX / 100) * bg.width, (posY / 100) * bg.height);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.font = FONTS[fontIdx].css.replace('1px', `${px}px`);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity / 100;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    if (subject) ctx.drawImage(subject, 0, 0, canvas.width, canvas.height); // 3. subject on top
  }, [bg, subject, text, size, posX, posY, rotation, color, opacity, fontIdx]);

  React.useEffect(() => { draw(); }, [draw]);

  const clear = React.useCallback(() => {
    setBg((b) => { b?.close(); return null; });
    setSubject((s) => { s?.close(); return null; });
  }, []);

  // Clipboard paste, drag-anywhere hover state, Esc to clear.
  // Paste is ignored while typing so it never steals paste into the text field.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: bg ? clear : undefined,
  });

  const download = (type: 'image/png' | 'image/jpeg') => {
    const canvas = canvasRef.current;
    if (!canvas || !bg) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `text-behind.${type === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      void makeThumb(blob).then((t) => t && setRecent('image-text-behind', t));
    }, type, 0.92);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div
        {...dropZone}
        className={cn(
          'relative flex aspect-[4/3] items-center justify-center overflow-hidden border bg-[oklch(20%_0.008_250)] transition-colors',
          dragging ? 'border-2 border-dashed border-[var(--color-cat-image)]' : 'border border-black/[0.08]',
        )}
      >
        {bg && dragging && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="border-2 border-dashed border-white/70 px-5 py-3 text-[14px] font-semibold text-white">Drop to replace</div>
          </div>
        )}
        {!bg && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">Drop, paste or click a photo with a clear subject</div>
              <div className="mt-1 text-[13px] text-white/55">A person, pet or object works best · files stay yours</div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <span className="border border-white/10 px-3 py-1.5">browse</span>
              <span className="text-white/40">or paste a screenshot</span>
            </div>
          </button>
        )}
        <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full object-contain', !bg && 'hidden')} />
        {running && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="w-72 space-y-3 text-center">
              <Wand2 className="mx-auto h-7 w-7 animate-pulse text-white" />
              <div className="text-[14px] font-semibold text-white">{progress?.phase ?? 'Working'}…</div>
              <div className="h-1 w-full overflow-hidden bg-white/10">
                <div className="h-full bg-[var(--color-cat-image)] transition-[width] duration-150" style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
      </div>

      <aside className="space-y-4">
        <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Text</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your text"
            className="w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[14px] text-[var(--color-fg)] focus:border-[var(--color-cat-image)] focus:outline-none" />
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {FONTS.map((f, i) => (
              <button key={f.label} type="button" onClick={() => setFontIdx(i)}
                className={cn('border px-1 py-1.5 text-[11px] font-bold transition', fontIdx === i ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <span className="text-[12px] text-[var(--color-fg-muted)]">Text color</span>
          </div>
        </div>

        <div className="space-y-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          {([
            ['Size', size, setSize, 4, 80],
            ['Horizontal', posX, setPosX, 0, 100],
            ['Vertical', posY, setPosY, 0, 100],
            ['Rotation', rotation, setRotation, -45, 45],
            ['Opacity', opacity, setOpacity, 10, 100],
          ] as [string, number, (v: number) => void, number, number][]).map(([label, val, set, min, max]) => (
            <div key={label}>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</label>
                <span className="font-mono text-[13px] tabular-nums text-[var(--color-fg)]">{val}</span>
              </div>
              <Slider.Root value={[val]} onValueChange={([v]) => set(v)} min={min} max={max} step={1} className="relative mt-2 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)] outline-none" />
              </Slider.Root>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => download('image/png')} disabled={!bg || running}
            className={cn('flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition', bg && !running ? 'bg-[var(--color-cat-image)] text-white hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
            <Download className="h-4 w-4" /> PNG
          </button>
          <button type="button" onClick={() => download('image/jpeg')} disabled={!bg || running}
            className={cn('flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition', bg && !running ? 'bg-[var(--color-fg)] text-[var(--color-canvas)] hover:opacity-90' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
            <Download className="h-4 w-4" /> JPG
          </button>
        </div>

        {bg && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={running}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <ImageIcon className="h-4 w-4" /> Replace photo
          </button>
        )}
      </aside>
    </div>
  );
}

async function makeThumb(blob: Blob): Promise<string> {
  try {
    const bm = await createImageBitmap(blob);
    const max = 192, scale = Math.min(1, max / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale)), h = Math.max(1, Math.round(bm.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return '';
    ctx.drawImage(bm, 0, 0, w, h); bm.close();
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return ''; }
}
