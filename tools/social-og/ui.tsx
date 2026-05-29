'use client';
import * as React from 'react';
import { Download } from 'lucide-react';

const PRESETS = [
  { label: 'OG (1.91:1)',     w: 1200, h: 630 },
  { label: 'X / Twitter',     w: 1200, h: 628 },
  { label: 'LinkedIn',        w: 1200, h: 627 },
  { label: 'Square',          w: 1080, h: 1080 },
];

const PALETTES = [
  { from: '#0ea5e9', to: '#6366f1', label: 'Ocean' },
  { from: '#f97316', to: '#ec4899', label: 'Sunset' },
  { from: '#10b981', to: '#06b6d4', label: 'Mint' },
  { from: '#ef4444', to: '#8b5cf6', label: 'Berry' },
  { from: '#0f172a', to: '#1e293b', label: 'Slate' },
  { from: '#fef3c7', to: '#fde68a', label: 'Cream' },
];

function draw(canvas: HTMLCanvasElement | OffscreenCanvas, opts: {
  w: number; h: number;
  title: string; subtitle: string; eyebrow: string;
  from: string; to: string; textColor: string;
  align: 'left' | 'center';
}) {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return;
  const { w, h, title, subtitle, eyebrow, from, to, textColor, align } = opts;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const pad = Math.round(w * 0.08);
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const x = align === 'center' ? w / 2 : pad;
  let y = pad;

  if (eyebrow) {
    ctx.font = `600 ${Math.round(w * 0.022)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(eyebrow.toUpperCase(), x, y);
    ctx.globalAlpha = 1;
    y += Math.round(w * 0.05);
  }

  const titleSize = Math.round(w * 0.07);
  ctx.font = `800 ${titleSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const titleLines = wrap(ctx, title, w - pad * 2);
  for (const line of titleLines) {
    ctx.fillText(line, x, y);
    y += titleSize * 1.15;
  }

  if (subtitle) {
    y += Math.round(w * 0.02);
    const subSize = Math.round(w * 0.028);
    ctx.font = `500 ${subSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.globalAlpha = 0.9;
    const subLines = wrap(ctx, subtitle, w - pad * 2);
    for (const line of subLines) {
      ctx.fillText(line, x, y);
      y += subSize * 1.4;
    }
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function Tool() {
  const [size, setSize] = React.useState(PRESETS[0]);
  const [title, setTitle] = React.useState('Every file. Every tool. One tap.');
  const [subtitle, setSubtitle] = React.useState('Xonvert — built for you, owned by you.');
  const [eyebrow, setEyebrow] = React.useState('Xonvert');
  const [palette, setPalette] = React.useState(PALETTES[0]);
  const [textColor, setTextColor] = React.useState('#ffffff');
  const [align, setAlign] = React.useState<'left' | 'center'>('left');
  const [url, setUrl] = React.useState('');

  // Track the latest URL in a ref so the unmount cleanup can revoke it.
  // Previously the last-generated blob URL leaked on every navigation away.
  const urlRef = React.useRef('');
  React.useEffect(() => { urlRef.current = url; }, [url]);
  React.useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  React.useEffect(() => {
    const c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    draw(c, { w: size.w, h: size.h, title, subtitle, eyebrow, from: palette.from, to: palette.to, textColor, align });
    c.toBlob((blob) => {
      if (!blob) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      setUrl(URL.createObjectURL(blob));
    }, 'image/png');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, title, subtitle, eyebrow, palette, textColor, align]);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `og-${size.w}x${size.h}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="border border-black/[0.08] bg-[oklch(95%_0.005_80)] p-3">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="OG preview" className="w-full" />
          )}
        </div>
        <div className="text-[11px] font-mono text-[var(--color-fg-subtle)]">{size.w} × {size.h}</div>
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => setSize(p)}
                  className={`border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${size.w === p.w && size.h === p.h ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Eyebrow</div>
            <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 text-[13px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Title</div>
            <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={2} className="mt-1 w-full resize-none bg-transparent border-b border-black/[0.1] py-1 text-[14px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Subtitle</div>
            <textarea value={subtitle} onChange={(e) => setSubtitle(e.target.value)} rows={2} className="mt-1 w-full resize-none bg-transparent border-b border-black/[0.1] py-1 text-[13px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Palette</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {PALETTES.map((p) => (
                <button key={p.label} type="button" onClick={() => setPalette(p)}
                  className={`relative h-10 border ${palette.label === p.label ? 'border-[var(--color-fg)]' : 'border-black/[0.08]'}`}
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  title={p.label}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Text color</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['left', 'center'] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAlign(a)} className={`border py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${align === a ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={download} disabled={!url}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-social)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" /> Download PNG
        </button>
      </aside>
    </div>
  );
}
