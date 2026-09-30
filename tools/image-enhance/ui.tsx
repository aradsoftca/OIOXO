'use client';
import * as React from 'react';
import { Loader2, Download, Sparkles, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IS_OIOXO } from '@/lib/brand';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { upscale, type UpscaleFactor } from '@/engines/upscale';
import { downloadBlob } from '@/engines/ffmpeg';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { useImageDrop } from '@/lib/compute/useImageDrop';

const POLICY_KEY = 'image-enhance';

export default function PhotoEnhancer() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [srcUrl, setSrcUrl] = React.useState('');
  const [factor, setFactor] = React.useState<UpscaleFactor>(2);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; blob: Blob } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { guard, gate } = useUsageGate('image-enhance');

  // Unmount-only cleanup. Previous deps `[out, srcUrl]` caused producing the
  // enhanced output (`out`) to revoke the source preview (`srcUrl`), which
  // visually broke the "before" image right after enhancement finished.
  const srcUrlRef = React.useRef(srcUrl);
  const outRef = React.useRef(out);
  React.useEffect(() => { srcUrlRef.current = srcUrl; }, [srcUrl]);
  React.useEffect(() => { outRef.current = out; }, [out]);
  React.useEffect(() => () => {
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
    if (outRef.current?.url) URL.revokeObjectURL(outRef.current.url);
  }, []);

  const load = (f: File) => { setFile(f); if (srcUrl) URL.revokeObjectURL(srcUrl); setSrcUrl(URL.createObjectURL(f)); setOut(null); setError(''); };

  const run = async () => {
    if (!file) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    if (!(await guard({ bytes: file.size }))) return;
    setBusy(true); setError(''); setOut(null); setRatio(0);
    try {
      const blob = await upscale(file, { factor, quality: 'balanced', onProgress: (p) => { setPhase(p.phase); setRatio(p.ratio); } });
      setOut({ url: URL.createObjectURL(blob), blob });
    } catch (e) { setError((e as Error).message || 'Could not enhance this image.'); }
    finally { setBusy(false); setPhase(''); }
  };

  const clear = React.useCallback(() => {
    setSrcUrl((u) => { if (u) URL.revokeObjectURL(u); return ''; });
    setOut((o) => { if (o?.url) URL.revokeObjectURL(o.url); return null; });
    setFile(null);
    setError('');
  }, []);

  // Enter runs the latest closure; mirror through a ref so we don't reorder.
  const runRef = React.useRef<() => void>(() => {});
  runRef.current = () => { void run(); };

  // Clipboard paste (screenshot → enhance), drag-anywhere hover state,
  // Esc to clear, Enter to enhance.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => load(f),
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
          <Upload className="h-7 w-7 text-[var(--color-cat-image)]" />
          <div className="text-[15px] font-semibold">{dragging ? 'Drop to enhance' : 'Drop, paste or click to enhance'}</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">Best on small or slightly soft images. Processed on your device.</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <img src={srcUrl} alt="" className="h-16 w-16 object-cover border border-black/[0.1]" />
            <span className="text-[12px] font-semibold">{file.name}</span>
            <button type="button" onClick={() => { setFile(null); setOut(null); }} className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
            <div className="ml-auto flex gap-1.5">
              {(IS_OIOXO ? [2, 4] as const : [2] as const).map((f) => <button key={f} type="button" onClick={() => setFactor(f)} className={cn('border px-3 py-1.5 text-[12px] font-bold', factor === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/10' : 'border-black/[0.12]')}>{f}×</button>)}
            </div>
          </div>
          <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {busy ? `${phase || 'Enhancing'}… ${Math.round(ratio * 100)}%` : `Enhance ${factor}×`}
          </button>
          {busy && ratio > 0 && <div className="h-1 w-full overflow-hidden bg-black/[0.06]"><div className="h-full bg-[var(--color-cat-image)] transition-[width]" style={{ width: `${ratio * 100}%` }} /></div>}
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-image)]/40 bg-[var(--color-cat-image)]/5 p-4">
          <img src={out.url} alt="enhanced" className="max-h-96 w-full object-contain bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:20px_20px]" />
          <button type="button" onClick={() => downloadBlob(out.blob, `enhanced-${factor}x.png`)} className="flex w-fit items-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</button>
        </div>
      )}
    </div>
  );
}
