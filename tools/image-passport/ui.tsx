'use client';
import * as React from 'react';
import { Loader2, Download, Upload, IdCard } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { removeBackground } from '@/engines/image';
import { downloadBlob } from '@/engines/ffmpeg';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { useImageDrop } from '@/lib/compute/useImageDrop';

const POLICY_KEY = 'image-passport';

// width × height in pixels at 300 DPI.
const SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'us', label: 'US 2×2 in', w: 600, h: 600 },
  { id: 'eu', label: 'EU/UK 35×45 mm', w: 413, h: 531 },
  { id: 'in', label: 'India 51×51 mm', w: 602, h: 602 },
  { id: 'cn', label: 'China 33×48 mm', w: 390, h: 567 },
];
const BGS = ['#ffffff', '#e8eef6', '#d6e4f0', '#c8d6e5'];

export default function PassportPhoto() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [size, setSize] = React.useState(SIZES[0]);
  const [bg, setBg] = React.useState(BGS[0]);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; blob: Blob } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { guard, gate } = useUsageGate('image');

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const run = async () => {
    if (!file) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    if (!(await guard({ bytes: file.size }))) return;
    setBusy(true); setError(''); setOut(null); setStatus('Removing background…');
    try {
      const cut = await removeBackground(file);
      const bmp = await createImageBitmap(cut);
      const canvas = document.createElement('canvas'); canvas.width = size.w; canvas.height = size.h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, size.w, size.h);
      // Fit the subject into the frame (contain) centered, head toward the top.
      const scale = Math.min(size.w / bmp.width, size.h / bmp.height) * 1.0;
      const dw = bmp.width * scale, dh = bmp.height * scale;
      ctx.drawImage(bmp, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
      bmp.close();
      const blob: Blob = await new Promise((r, j) => canvas.toBlob((b) => b ? r(b) : j(new Error('export failed')), 'image/jpeg', 0.95));
      setOut({ url: URL.createObjectURL(blob), blob });
    } catch (e) { setError((e as Error).message || 'Could not process this photo.'); }
    finally { setBusy(false); setStatus(''); }
  };

  const clear = React.useCallback(() => {
    setFile(null);
    setOut((o) => { if (o?.url) URL.revokeObjectURL(o.url); return null; });
    setError('');
  }, []);

  // Enter runs the latest closure; mirror through a ref so we don't reorder.
  const runRef = React.useRef<() => void>(() => {});
  runRef.current = () => { void run(); };

  // Clipboard paste sets the photo, drag-anywhere hover state, Esc to clear, Enter to make.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => { setFile(f); setOut(null); },
    onClear: file ? clear : undefined,
    onRun: file && !busy ? () => runRef.current() : undefined,
  });

  return (
    <div className="space-y-4">
      {gate}
      {policyGate.element}
      {!file ? (
        <div onClick={() => inputRef.current?.click()} {...dropZone}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed bg-[var(--color-surface-1)] px-6 py-16 text-center transition-colors',
            dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.14]',
          )}>
          <IdCard className="h-7 w-7 text-[var(--color-cat-image)]" />
          <div className="text-[15px] font-semibold">{dragging ? 'Drop to make a passport photo' : 'Drop, paste or click a head-and-shoulders photo'}</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">Use a clear, front-facing photo. Everything runs on your device.</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold">{file.name}</span>
            <button type="button" onClick={() => { setFile(null); setOut(null); }} className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => <button key={s.id} type="button" onClick={() => setSize(s)} className={cn('border px-3 py-2 text-[12px] font-semibold', size.id === s.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.12]')}>{s.label}</button>)}
          </div>
          <div className="flex items-center gap-2 text-[12px]"><span className="text-[var(--color-fg-muted)]">Background</span>
            {BGS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} className={cn('h-7 w-7 rounded-full border-2', bg === c ? 'border-[var(--color-cat-image)]' : 'border-black/[0.1]')} style={{ background: c }} />)}
          </div>
          <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IdCard className="h-3.5 w-3.5" />} {busy ? status || 'Working…' : 'Make photo'}
          </button>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setOut(null); } e.target.value = ''; }} />
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-image)]/40 bg-[var(--color-cat-image)]/5 p-4">
          <img src={out.url} alt="passport" className="max-h-96 border border-black/[0.1]" />
          <button type="button" onClick={() => downloadBlob(out.blob, `passport-${size.id}.jpg`)} className="flex w-fit items-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</button>
        </div>
      )}
    </div>
  );
}
