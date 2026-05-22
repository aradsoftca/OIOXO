'use client';
import * as React from 'react';
import { Download } from 'lucide-react';

const BANNERS = [
  { label: 'X / Twitter header',  w: 1500, h: 500 },
  { label: 'YouTube banner',      w: 2560, h: 1440 },
  { label: 'LinkedIn cover',      w: 1584, h: 396 },
  { label: 'Facebook cover',      w: 1640, h: 859 },
  { label: 'Twitch banner',       w: 1200, h: 480 },
  { label: 'GitHub social card',  w: 1280, h: 640 },
];

const PALETTES = [
  ['#0f172a', '#1e293b'], ['#0ea5e9', '#6366f1'], ['#f97316', '#ec4899'],
  ['#10b981', '#06b6d4'], ['#ef4444', '#8b5cf6'], ['#fef3c7', '#fde68a'],
];

function draw(c: HTMLCanvasElement | OffscreenCanvas, opts: {
  w: number; h: number; from: string; to: string;
  heading: string; tagline: string; handle: string; textColor: string;
}) {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  const { w, h, from, to, heading, tagline, handle, textColor } = opts;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, from); g.addColorStop(1, to);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const pad = Math.round(Math.min(w, h) * 0.08);
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const baseY = h / 2;
  const headSize = Math.round(h * 0.18);
  ctx.font = `800 ${headSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(heading, pad, baseY - headSize * 0.4);

  if (tagline) {
    const tagSize = Math.round(h * 0.07);
    ctx.font = `500 ${tagSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(tagline, pad, baseY + tagSize * 0.6);
    ctx.globalAlpha = 1;
  }

  if (handle) {
    const handleSize = Math.round(h * 0.055);
    ctx.font = `600 ${handleSize}px ui-monospace, "SF Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(handle, w - pad, h - pad);
  }
}

export default function Tool() {
  const [size, setSize] = React.useState(BANNERS[0]);
  const [palette, setPalette] = React.useState(PALETTES[0]);
  const [heading, setHeading] = React.useState('YOUR NAME');
  const [tagline, setTagline] = React.useState('Building useful things, one small tool at a time.');
  const [handle, setHandle] = React.useState('@username');
  const [textColor, setTextColor] = React.useState('#ffffff');
  const [url, setUrl] = React.useState('');

  React.useEffect(() => {
    const c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    draw(c, { ...size, from: palette[0], to: palette[1], heading, tagline, handle, textColor });
    c.toBlob((blob) => {
      if (!blob) return;
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(blob));
    }, 'image/png');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, palette, heading, tagline, handle, textColor]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="border border-black/[0.08] bg-[oklch(95%_0.005_80)] p-3">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="banner preview" className="w-full" />
          )}
        </div>
        <div className="font-mono text-[11px] text-[var(--color-fg-subtle)]">{size.w} × {size.h}</div>
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-1">
          {BANNERS.map((b) => (
            <button key={b.label} type="button" onClick={() => setSize(b)}
              className={`flex w-full items-center justify-between border px-3 py-2 text-left text-[12px] transition ${size.w === b.w && size.h === b.h ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)] text-white' : 'border-black/[0.08] text-[var(--color-fg)]'}`}>
              <span className="font-semibold">{b.label}</span>
              <span className={`font-mono text-[10px] ${size.w === b.w ? 'text-white/75' : 'text-[var(--color-fg-subtle)]'}`}>{b.w}×{b.h}</span>
            </button>
          ))}
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Heading</div>
            <input value={heading} onChange={(e) => setHeading(e.target.value)} className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 text-[14px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Tagline</div>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 text-[12px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Handle</div>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[12px] outline-none focus:border-[var(--color-cat-social)]" />
          </label>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Palette</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {PALETTES.map((p, i) => (
              <button key={i} type="button" onClick={() => setPalette(p)}
                className={`h-10 border ${palette[0] === p[0] ? 'border-[var(--color-fg)]' : 'border-black/[0.08]'}`}
                style={{ background: `linear-gradient(135deg, ${p[0]}, ${p[1]})` }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Text color</span>
          </div>
        </div>

        <button type="button" onClick={() => {
            if (!url) return;
            const a = document.createElement('a');
            a.href = url; a.download = `banner-${size.w}x${size.h}.png`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }} disabled={!url}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-social)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" /> Download PNG
        </button>
      </aside>
    </div>
  );
}
