'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { cn } from '@/lib/cn';

const FORMATS = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14', 'pharmacode', 'codabar'] as const;
type Format = typeof FORMATS[number];

const DEFAULT_VALUES: Record<Format, string> = {
  CODE128: 'XONVERT-2026',
  CODE39:  'HELLO',
  EAN13:   '5901234123457',
  EAN8:    '96385074',
  UPC:     '042100005264',
  ITF14:   '10012345678905',
  pharmacode: '1234',
  codabar: 'A12345B',
};

export default function Tool() {
  const [format, setFormat] = React.useState<Format>('CODE128');
  const [value, setValue] = React.useState(DEFAULT_VALUES.CODE128);
  const [error, setError] = React.useState('');
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, { format, displayValue: true, fontSize: 16, height: 80, margin: 10 });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [format, value]);

  const download = (kind: 'svg' | 'png') => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);

    if (kind === 'svg') {
      const blob = new Blob([xml], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `barcode-${format}.svg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      // 60s defer — mobile browsers abort the saved file if the blob URL
      // is torn down before the download dialog actually starts streaming.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * 2;
      c.height = img.height * 2;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `barcode-${format}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-h-[260px] items-center justify-center border border-black/[0.08] bg-white p-6">
        <svg ref={svgRef} className="max-w-full" />
      </div>

      <aside className="space-y-4">
        <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Value</div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[16px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-generator)]"
          />
          {error && <div className="mt-1 text-[11px] text-[oklch(58%_0.22_22)]">{error}</div>}
        </label>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFormat(f); setValue(DEFAULT_VALUES[f]); }}
                className={cn(
                  'border py-2 text-[11px] font-bold uppercase tracking-wider transition',
                  format === f
                    ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                    : 'border-black/[0.08] text-[var(--color-fg-muted)]',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => download('png')} className="flex items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
            <Download className="h-3.5 w-3.5" /> PNG
          </button>
          <button type="button" onClick={() => download('svg')} className="flex items-center justify-center gap-2 border border-black/[0.08] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
            <Download className="h-3.5 w-3.5" /> SVG
          </button>
        </div>
      </aside>
    </div>
  );
}
