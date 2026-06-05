'use client';

/**
 * QR Studio — oioxo / newxonvert version.
 * Styled QR codes: solid or gradient module colours, palette presets, a centre
 * logo, and Wi-Fi/text payloads. Rendered onto a <canvas> so the platform's
 * free-tier watermark patch applies automatically on PNG export.
 */

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Upload, X } from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';

type ContentKind = 'text' | 'wifi';
type Level = 'L' | 'M' | 'Q' | 'H';

const LEVELS: Array<{ id: Level; label: string; recovery: string }> = [
  { id: 'L', label: 'Low', recovery: '7%' },
  { id: 'M', label: 'Medium', recovery: '15%' },
  { id: 'Q', label: 'Quartile', recovery: '25%' },
  { id: 'H', label: 'High', recovery: '30%' },
];

const PALETTES: Array<{ name: string; fg: string; bg: string; grad?: [string, string] }> = [
  { name: 'Classic', fg: '#0a0a0a', bg: '#ffffff' },
  { name: 'Ocean', fg: '#0369a1', bg: '#ffffff', grad: ['#0ea5e9', '#4f46e5'] },
  { name: 'Sunset', fg: '#b91c1c', bg: '#ffffff', grad: ['#f97316', '#db2777'] },
  { name: 'Forest', fg: '#166534', bg: '#ffffff', grad: ['#22c55e', '#0d9488'] },
  { name: 'Mono', fg: '#ffffff', bg: '#0a0a0a' },
];

export default function QRStudioUI() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const logoRef = React.useRef<HTMLImageElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [kind, setKind] = React.useState<ContentKind>('text');
  const [text, setText] = React.useState('https://xonvert.com');
  const [wifiSsid, setWifiSsid] = React.useState('');
  const [wifiPass, setWifiPass] = React.useState('');
  const [wifiEnc, setWifiEnc] = React.useState<'WPA' | 'WEP' | 'nopass'>('WPA');

  const [size, setSize] = React.useState(512);
  const [margin, setMargin] = React.useState(4);
  const [level, setLevel] = React.useState<Level>('M');
  const [fg, setFg] = React.useState('#0a0a0a');
  const [bg, setBg] = React.useState('#ffffff');
  const [useGrad, setUseGrad] = React.useState(false);
  const [g1, setG1] = React.useState('#0ea5e9');
  const [g2, setG2] = React.useState('#4f46e5');
  const [hasLogo, setHasLogo] = React.useState(false);
  const [error, setError] = React.useState('');

  const payload = React.useMemo(() => {
    if (kind === 'wifi') {
      if (!wifiSsid) return '';
      const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
      return `WIFI:T:${wifiEnc};S:${esc(wifiSsid)};P:${esc(wifiPass)};;`;
    }
    return text;
  }, [kind, text, wifiSsid, wifiPass, wifiEnc]);

  const render = React.useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!payload) { ctx.clearRect(0, 0, canvas.width, canvas.height); setError(''); return; }
    const ecl: Level = hasLogo && level === 'L' ? 'H' : level; // logos need redundancy
    try {
      // 1. base QR (black/white) on an offscreen canvas so we can recolour it
      const tmp = document.createElement('canvas');
      await QRCode.toCanvas(tmp, payload, {
        width: size, margin, errorCorrectionLevel: ecl,
        color: { dark: '#000000', light: '#ffffff' },
      });
      const dim = tmp.width;
      canvas.width = dim; canvas.height = dim;

      // 2. background
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dim, dim);

      // 3. module fill (solid or gradient) masked to the dark modules
      const fill = document.createElement('canvas');
      fill.width = dim; fill.height = dim;
      const fctx = fill.getContext('2d')!;
      if (useGrad) {
        const grad = fctx.createLinearGradient(0, 0, dim, dim);
        grad.addColorStop(0, g1); grad.addColorStop(1, g2);
        fctx.fillStyle = grad;
      } else {
        fctx.fillStyle = fg;
      }
      fctx.fillRect(0, 0, dim, dim);

      const mask = tmp.getContext('2d')!.getImageData(0, 0, dim, dim);
      const md = mask.data;
      for (let i = 0; i < md.length; i += 4) {
        md[i + 3] = md[i] < 128 ? 255 : 0; // keep fill only on dark modules
        md[i] = md[i + 1] = md[i + 2] = 0;
      }
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = dim; maskCanvas.height = dim;
      maskCanvas.getContext('2d')!.putImageData(mask, 0, 0);
      fctx.globalCompositeOperation = 'destination-in';
      fctx.drawImage(maskCanvas, 0, 0);
      ctx.drawImage(fill, 0, 0);

      // 4. centre logo (with a white pad so it stays scannable)
      if (hasLogo && logoRef.current) {
        const lw = Math.round(dim * 0.2);
        const pos = Math.round((dim - lw) / 2);
        const pad = Math.round(lw * 0.12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(pos - pad, pos - pad, lw + pad * 2, lw + pad * 2);
        ctx.drawImage(logoRef.current, pos, pos, lw, lw);
      }

      setError('');
      setRecent('studio-qr', canvas.toDataURL('image/png'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [payload, size, margin, level, fg, bg, useGrad, g1, g2, hasLogo]);

  React.useEffect(() => { render(); }, [render]);

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { logoRef.current = img; setHasLogo(true); render(); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); };
    img.src = url;
  };
  const clearLogo = () => {
    logoRef.current = null; setHasLogo(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyPalette = (p: typeof PALETTES[number]) => {
    setFg(p.fg); setBg(p.bg);
    if (p.grad) { setUseGrad(true); setG1(p.grad[0]); setG2(p.grad[1]); }
    else setUseGrad(false);
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'qr-studio.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const downloadSvg = async () => {
    if (!payload) return;
    const svg = await QRCode.toString(payload, {
      type: 'svg', margin, errorCorrectionLevel: level,
      color: { dark: useGrad ? g1 : fg, light: bg },
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'qr-studio.svg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const labelCls = 'text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex aspect-square items-center justify-center border border-black/[0.08] p-6" style={{ background: bg }}>
        <canvas ref={canvasRef} className="h-full w-full object-contain" />
        {!payload && !error && (
          <div className="absolute text-[14px] text-[var(--color-fg-muted)]">Enter content to generate…</div>
        )}
        {error && <div className="absolute text-[14px] text-[oklch(58%_0.22_22)]">{error}</div>}
      </div>

      <aside className="space-y-4">
        {/* content type */}
        <div className="grid grid-cols-2 gap-1">
          {(['text', 'wifi'] as ContentKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={cn('border py-2 text-[11px] font-bold uppercase tracking-wider transition',
                kind === k ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)]')}>
              {k === 'text' ? 'Text / URL' : 'Wi-Fi'}
            </button>
          ))}
        </div>

        {kind === 'text' ? (
          <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className={labelCls}>Text or URL</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              className="mt-2 w-full resize-none bg-transparent font-mono text-[13px] text-[var(--color-fg)] outline-none" />
          </label>
        ) : (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
            <div className={labelCls}>Wi-Fi network</div>
            <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="Network name (SSID)"
              className="w-full bg-transparent text-[13px] text-[var(--color-fg)] outline-none border-b border-black/[0.08] py-1" />
            <input value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} placeholder="Password" type="text"
              className="w-full bg-transparent text-[13px] text-[var(--color-fg)] outline-none border-b border-black/[0.08] py-1" />
            <div className="grid grid-cols-3 gap-1 pt-1">
              {(['WPA', 'WEP', 'nopass'] as const).map((enc) => (
                <button key={enc} type="button" onClick={() => setWifiEnc(enc)}
                  className={cn('border py-1 text-[10px] font-bold uppercase transition',
                    wifiEnc === enc ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)]')}>
                  {enc === 'nopass' ? 'Open' : enc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* palettes */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className={labelCls}>Style</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PALETTES.map((p) => (
              <button key={p.name} type="button" onClick={() => applyPalette(p)} title={p.name}
                className="h-7 w-7 rounded-full border border-black/15"
                style={{ background: p.grad ? `linear-gradient(135deg, ${p.grad[0]}, ${p.grad[1]})` : p.fg }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input type="color" value={fg} onChange={(e) => { setFg(e.target.value); setUseGrad(false); }}
                className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
              <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">Dots</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)}
                className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
              <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">Background</span>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
            <input type="checkbox" checked={useGrad} onChange={(e) => setUseGrad(e.target.checked)} />
            Gradient dots
          </label>
          {useGrad && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="color" value={g1} onChange={(e) => setG1(e.target.value)} className="h-8 w-full cursor-pointer border border-black/[0.08]" />
              <input type="color" value={g2} onChange={(e) => setG2(e.target.value)} className="h-8 w-full cursor-pointer border border-black/[0.08]" />
            </div>
          )}
        </div>

        {/* logo */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className={labelCls}>Centre logo</div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 border border-black/[0.08] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Upload className="h-3.5 w-3.5" /> {hasLogo ? 'Replace' : 'Upload'}
            </button>
            {hasLogo && (
              <button type="button" onClick={clearLogo}
                className="flex items-center justify-center border border-black/[0.08] px-3 text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} className="hidden" />
        </div>

        {/* size / margin / level */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className={labelCls}>Size</span>
              <span className="font-mono text-[13px] tabular-nums">{size}px</span>
            </div>
            <Slider.Root value={[size]} min={128} max={1024} step={32} onValueChange={([v]) => setSize(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-generator)]" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-generator)]" />
            </Slider.Root>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className={labelCls}>Margin</span>
              <span className="font-mono text-[13px] tabular-nums">{margin}</span>
            </div>
            <Slider.Root value={[margin]} min={0} max={10} step={1} onValueChange={([v]) => setMargin(v)} className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-black/30" /></Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-white" />
            </Slider.Root>
          </div>
          <div>
            <div className={labelCls}>Error correction</div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" onClick={() => setLevel(l.id)}
                  className={cn('border py-1.5 text-[10px] font-bold uppercase tracking-wider transition',
                    level === l.id ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)]')}
                  title={`${l.label} — recovers ${l.recovery}`}>
                  {l.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={downloadPng} disabled={!payload}
            className="flex items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
            <Download className="h-3.5 w-3.5" /> PNG
          </button>
          <button type="button" onClick={downloadSvg} disabled={!payload}
            className="flex items-center justify-center gap-2 border border-black/[0.08] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]">
            <Download className="h-3.5 w-3.5" /> SVG
          </button>
        </div>
      </aside>
    </div>
  );
}
