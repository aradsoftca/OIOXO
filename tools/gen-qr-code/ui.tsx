'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';

const LEVELS: Array<{ id: 'L' | 'M' | 'Q' | 'H'; label: string; recovery: string }> = [
  { id: 'L', label: 'Low',       recovery: '7%' },
  { id: 'M', label: 'Medium',    recovery: '15%' },
  { id: 'Q', label: 'Quartile',  recovery: '25%' },
  { id: 'H', label: 'High',      recovery: '30%' },
];

export default function Tool() {
  const [text, setText] = React.useState('https://xonvert.com');
  const [size, setSize] = React.useState(512);
  const [margin, setMargin] = React.useState(4);
  const [fg, setFg] = React.useState('#0a0a0a');
  const [bg, setBg] = React.useState('#ffffff');
  const [level, setLevel] = React.useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [dataUrl, setDataUrl] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!text) { setDataUrl(''); setError(''); return; }
    let cancelled = false;
    QRCode.toDataURL(text, {
      width: size,
      margin,
      errorCorrectionLevel: level,
      color: { dark: fg, light: bg },
    }).then((url) => {
      if (cancelled) return;
      setDataUrl(url);
      setError('');
      // Only persist a small thumbnail — the live data URL grows with size
      // and gets written on every keystroke; a 1024px QR is ~80KB and would
      // thrash localStorage for the home-screen tile.
      if (url.length < 20000) setRecent('gen-qr-code', url);
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : String(e));
    });
    return () => { cancelled = true; };
  }, [text, size, margin, fg, bg, level]);

  const download = (ext: 'png' | 'svg') => {
    if (!dataUrl) return;
    if (ext === 'png') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qrcode-${size}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    QRCode.toString(text, { type: 'svg', margin, errorCorrectionLevel: level, color: { dark: fg, light: bg } })
      .then((svg) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qrcode.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Defer revoke: a.click() doesn't block on the download dialog and
        // some browsers (mobile Safari/Firefox) abort the download if the
        // blob URL is torn down before the stream starts.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex aspect-square items-center justify-center border border-black/[0.08]" style={{ background: bg }}>
        {dataUrl && (
          <img src={dataUrl} alt="QR code" className="h-full w-full object-contain" />
        )}
        {!dataUrl && !error && (
          <div className="text-[14px] text-[var(--color-fg-muted)]">Enter text to generate…</div>
        )}
        {error && <div className="text-[14px] text-[oklch(58%_0.22_22)]">{error}</div>}
      </div>

      <aside className="space-y-4">
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Text or URL</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none bg-transparent font-mono text-[13px] text-[var(--color-fg)] outline-none"
          />
        </label>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</span>
              <span className="font-mono text-[13px] tabular-nums">{size}px</span>
            </div>
            <Slider.Root value={[size]} min={128} max={1024} step={32} onValueChange={([v]) => setSize(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-generator)]" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-generator)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Margin</span>
              <span className="font-mono text-[13px] tabular-nums">{margin}</span>
            </div>
            <Slider.Root value={[margin]} min={0} max={10} step={1} onValueChange={([v]) => setMargin(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-black/30" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-white" />
            </Slider.Root>
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Colors</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">Foreground</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">Background</span>
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Error correction</div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevel(l.id)}
                  className={cn(
                    'border py-1.5 text-[10px] font-bold uppercase tracking-wider transition',
                    level === l.id
                      ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)]',
                  )}
                  title={`${l.label} — recovers ${l.recovery}`}
                >
                  {l.id}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">
              {LEVELS.find((l) => l.id === level)?.label} — recovers {LEVELS.find((l) => l.id === level)?.recovery}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => download('png')}
            disabled={!dataUrl}
            className="flex items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none"
          >
            <Download className="h-3.5 w-3.5" /> PNG
          </button>
          <button
            type="button"
            onClick={() => download('svg')}
            disabled={!text}
            className="flex items-center justify-center gap-2 border border-black/[0.08] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]"
          >
            <Download className="h-3.5 w-3.5" /> SVG
          </button>
        </div>
      </aside>
    </div>
  );
}
