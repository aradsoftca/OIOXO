'use client';

/**
 * Thumbnail Studio — oioxo / newxonvert version.
 * A YouTube-style thumbnail maker: photo or gradient background, a big
 * auto-wrapped outlined title (positioned), subtitle, corner badge, fonts and a
 * legibility overlay — rendered on a 1280×720 <canvas> and exported as PNG.
 */

import * as React from 'react';
import { Upload, Download, Image as ImageIcon, Sparkles } from 'lucide-react';

const W = 1280, H = 720;
const GRADS: [string, string][] = [
  ['#111827', '#374151'], ['#0ea5e9', '#2563eb'], ['#f59e0b', '#ef4444'], ['#f472b6', '#fb7185'],
  ['#22c55e', '#0d9488'], ['#a855f7', '#6366f1'], ['#0f172a', '#7c3aed'], ['#dc2626', '#0a0a0a'],
];
const FONTS = ['Impact, sans-serif', 'Arial Black, sans-serif', 'system-ui, sans-serif', 'Georgia, serif', 'Trebuchet MS, sans-serif'];

export default function ThumbnailStudioUI() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Cutout subject drawn IN FRONT OF the title (the signature modern thumbnail
  // look) — background removed on-device via the shared removeBackground engine.
  const cutoutRef = React.useRef<HTMLImageElement | null>(null);
  const cutoutFileRef = React.useRef<HTMLInputElement>(null);
  const [cutoutScale, setCutoutScale] = React.useState(85);
  const [busy, setBusy] = React.useState('');
  const [, forceRender] = React.useReducer(x => x + 1, 0);

  const [grad, setGrad] = React.useState(0);
  const [useImg, setUseImg] = React.useState(false);
  const [overlay, setOverlay] = React.useState(35);
  const [title, setTitle] = React.useState('NEW VIDEO');
  const [titleColor, setTitleColor] = React.useState('#fbbf24');
  const [titleSize, setTitleSize] = React.useState(150);
  const [titlePos, setTitlePos] = React.useState<'top' | 'center' | 'bottom'>('center');
  const [font, setFont] = React.useState(FONTS[0]);
  const [sub, setSub] = React.useState('');
  const [subColor, setSubColor] = React.useState('#ffffff');
  const [badge, setBadge] = React.useState('');

  const render = React.useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (useImg && imgRef.current) {
      const img = imgRef.current; const s = Math.max(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, GRADS[grad][0]); g.addColorStop(1, GRADS[grad][1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (overlay > 0) { ctx.fillStyle = `rgba(0,0,0,${overlay / 100})`; ctx.fillRect(0, 0, W, H); }

    const ty = titlePos === 'top' ? H * 0.24 : titlePos === 'bottom' ? H * 0.78 : H / 2;
    ctx.font = `bold ${titleSize}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const words = title.split(' '); const lines: string[] = []; let line = '';
    for (const wd of words) { const t = line ? `${line} ${wd}` : wd; if (ctx.measureText(t).width > W * 0.9 && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    const lh = titleSize * 1.05; const startY = ty - ((lines.length - 1) * lh) / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 24; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 8;
    ctx.strokeStyle = '#000000'; ctx.lineWidth = titleSize * 0.09;
    lines.forEach((ln, i) => ctx.strokeText(ln, W / 2, startY + i * lh));
    ctx.shadowColor = 'transparent'; ctx.fillStyle = titleColor;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lh));

    if (sub) {
      const ss = Math.round(titleSize * 0.34); ctx.font = `bold ${ss}px ${font}`;
      const sy = startY + lines.length * lh;
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10; ctx.lineWidth = ss * 0.18; ctx.strokeStyle = '#000000';
      ctx.strokeText(sub, W / 2, sy); ctx.shadowColor = 'transparent'; ctx.fillStyle = subColor; ctx.fillText(sub, W / 2, sy);
    }
    if (badge) {
      ctx.shadowColor = 'transparent'; const bs = 46; ctx.font = `bold ${bs}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const pad = 18; const bw = ctx.measureText(badge).width + pad * 2;
      ctx.fillStyle = '#ef4444'; ctx.fillRect(44, 44, bw, bs + pad); ctx.fillStyle = '#ffffff'; ctx.fillText(badge, 44 + pad, 44 + pad / 2);
    }
    // Cutout subject LAST → drawn in front of the title. Bottom-anchored,
    // right-of-center, scaled to taste, with a soft drop shadow for pop.
    if (cutoutRef.current) {
      const co = cutoutRef.current;
      const h = H * (cutoutScale / 100);
      const w = (co.width / co.height) * h;
      const x = W * 0.62 - w / 2;
      const yPos = H - h;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 6;
      ctx.drawImage(co, x, yPos, w, h);
      ctx.restore();
    }
  }, [grad, useImg, overlay, title, titleColor, titleSize, titlePos, font, sub, subColor, badge, cutoutScale]);

  React.useEffect(() => { render(); }, [render]);

  const loadImg = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setUseImg(true); URL.revokeObjectURL(url); render(); };
    // Without an error path, a corrupt image leaked the blob URL.
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };
  const loadCutout = async (f: File) => {
    setBusy('Cutting out subject on your device…');
    try {
      const { removeBackground } = await import('@/engines/image/bgRemove');
      const cut = await removeBackground(f, { quality: 'balanced' });
      const url = URL.createObjectURL(cut);
      const img = new Image();
      img.onload = () => { cutoutRef.current = img; URL.revokeObjectURL(url); forceRender(); };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    } catch { /* surfaced via busy clearing */ } finally { setBusy(''); }
  };
  const clearCutout = () => { cutoutRef.current = null; forceRender(); };
  const download = () => { const c = canvasRef.current; if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'thumbnail.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); };

  const lbl = 'text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]';
  const inp = 'w-full border border-black/[0.1] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] text-[var(--color-fg)] outline-none';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg shadow-lg" style={{ aspectRatio: '16/9' }}>
          <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        </div>
        <button type="button" onClick={download} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-social)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110"><Download className="h-4 w-4" /> Export PNG (1280×720)</button>
      </div>

      <aside className="space-y-4">
        <div>
          <div className={lbl}>Background</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GRADS.map((g, i) => <button key={i} type="button" onClick={() => { setGrad(i); setUseImg(false); }} className={`h-7 w-7 rounded-full border-2 ${!useImg && grad === i ? 'border-[var(--color-fg)]' : 'border-black/15'}`} style={{ background: `linear-gradient(135deg,${g[0]},${g[1]})` }} />)}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className={`mt-2 flex w-full items-center justify-center gap-2 border py-2 text-[11px] font-bold uppercase tracking-wider ${useImg ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)]/10' : 'border-black/[0.12]'} hover:bg-[var(--color-surface-2)]`}><ImageIcon className="h-3.5 w-3.5" /> {useImg ? 'Photo background ✓' : 'Use a photo'}</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImg(f); }} />
          <label className="mt-2 flex items-center justify-between gap-2 text-[12px]">Darken<input type="range" min={0} max={70} value={overlay} onChange={(e) => setOverlay(+e.target.value)} /></label>
          <button type="button" onClick={() => cutoutFileRef.current?.click()} disabled={!!busy} className={`mt-3 flex w-full items-center justify-center gap-2 border py-2 text-[11px] font-bold uppercase tracking-wider ${cutoutRef.current ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)]/10' : 'border-black/[0.12]'} hover:bg-[var(--color-surface-2)] disabled:opacity-50`}><Sparkles className="h-3.5 w-3.5" /> {busy ? 'Cutting out…' : cutoutRef.current ? 'Subject in front ✓' : 'Subject in front of text'}</button>
          <input ref={cutoutFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadCutout(f); e.currentTarget.value = ''; }} />
          {cutoutRef.current && (
            <>
              <label className="mt-2 flex items-center justify-between gap-2 text-[12px]">Subject size<input type="range" min={40} max={130} value={cutoutScale} onChange={(e) => setCutoutScale(+e.target.value)} /></label>
              <button type="button" onClick={clearCutout} className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)] hover:text-red-500">Remove subject</button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className={lbl}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} />
          <select value={font} onChange={(e) => setFont(e.target.value)} className={inp}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}</select>
          <div className="flex items-center gap-2">
            <input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} className="h-8 w-9 cursor-pointer border border-black/[0.1]" />
            <label className="flex flex-1 items-center gap-1 text-[12px]">Size<input type="range" min={60} max={260} value={titleSize} onChange={(e) => setTitleSize(+e.target.value)} className="flex-1" /></label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['top', 'center', 'bottom'] as const).map((p) => <button key={p} type="button" onClick={() => setTitlePos(p)} className={`border px-1 py-1 text-[10px] font-semibold capitalize ${titlePos === p ? 'border-[var(--color-cat-social)] bg-[var(--color-cat-social)]/10' : 'border-black/[0.1] text-[var(--color-fg-muted)]'}`}>{p}</button>)}
          </div>
        </div>

        <div className="space-y-2">
          <div className={lbl}>Subtitle</div>
          <div className="flex items-center gap-2">
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="optional" className={inp} />
            <input type="color" value={subColor} onChange={(e) => setSubColor(e.target.value)} className="h-8 w-9 cursor-pointer border border-black/[0.1]" />
          </div>
        </div>

        <div className="space-y-2">
          <div className={lbl}>Corner badge</div>
          <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. NEW, LIVE, 4K" className={inp} />
        </div>
      </aside>
    </div>
  );
}
