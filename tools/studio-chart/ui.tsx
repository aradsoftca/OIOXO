'use client';

/**
 * Chart Maker — oioxo / newxonvert version.
 * Paste rows or import CSV → bar / line / area / pie chart, rendered on a
 * <canvas> (PNG export, watermark-aware) with a vector SVG export too. Local.
 */

import * as React from 'react';
import { Download, Upload, BarChart3, LineChart, PieChart, AreaChart } from 'lucide-react';
import { setRecent } from '@/lib/storage/recent';
import { brandSvg } from '@/lib/watermark/download';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'studio-chart';

type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter' | 'stacked' | 'hbar';
interface Series { name: string; values: number[]; }
interface Data { labels: string[]; series: Series[]; }

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];
const SAMPLE = 'Month,Sales,Costs\nJan,120,80\nFeb,150,90\nMar,90,70\nApr,200,120\nMay,170,100';

function parseData(text: string): Data {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(',').map((c) => c.trim())).filter((r) => r.length && r.some((c) => c !== ''));
  if (!rows.length) return { labels: [], series: [] };
  const firstValsNumeric = rows[0].slice(1).length > 0 && rows[0].slice(1).every((c) => c !== '' && !isNaN(Number(c)));
  let header: string[] | null = null;
  let start = 0;
  if (!firstValsNumeric && rows.length > 1) { header = rows[0]; start = 1; }
  const nSeries = Math.max(1, ...rows.slice(start).map((r) => r.length - 1));
  const series: Series[] = Array.from({ length: nSeries }, (_, i) => ({ name: header?.[i + 1] || `Series ${i + 1}`, values: [] }));
  const labels: string[] = [];
  for (let r = start; r < rows.length; r++) {
    labels.push(rows[r][0] || '');
    for (let s = 0; s < nSeries; s++) series[s].values.push(Number(rows[r][s + 1] || 0) || 0);
  }
  return { labels, series };
}

const W = 900, H = 540, PAD = 64;

function maxVal(d: Data): number {
  let m = 0;
  for (const s of d.series) for (const v of s.values) if (v > m) m = v;
  return m || 1;
}

function drawChart(ctx: CanvasRenderingContext2D, d: Data, type: ChartType, title: string) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 24px system-ui, Arial, sans-serif'; ctx.textBaseline = 'top';
  if (title) ctx.fillText(title, PAD, 18);
  const top = title ? 60 : 30;
  const plotW = W - PAD * 2, plotH = H - top - PAD;
  const x0 = PAD, y0 = top + plotH;

  if (type === 'pie' || type === 'donut') {
    const s = d.series[0]; if (!s) return;
    const total = s.values.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = top + plotH / 2, rad = Math.min(plotW, plotH) / 2.4;
    const inner = type === 'donut' ? rad * 0.55 : 0;
    let ang = -Math.PI / 2;
    s.values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      if (inner) { ctx.arc(cx, cy, rad, ang, ang + slice); ctx.arc(cx, cy, inner, ang + slice, ang, true); }
      else { ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, ang, ang + slice); }
      ctx.closePath(); ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill();
      ang += slice;
    });
    if (type === 'donut') { ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 22px system-ui, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(total), cx, cy); ctx.textAlign = 'left'; }
    // legend
    ctx.font = '13px system-ui, Arial, sans-serif'; ctx.textBaseline = 'middle';
    d.labels.forEach((lb, i) => {
      const ly = top + i * 22;
      ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fillRect(W - 160, ly, 12, 12);
      ctx.fillStyle = '#333'; ctx.fillText(`${lb} (${Math.round((s.values[i] / total) * 100)}%)`, W - 142, ly + 6);
    });
    return;
  }

  const mx = maxVal(d);
  // gridlines + y labels
  ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#9ca3af'; ctx.font = '12px system-ui, Arial, sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const y = top + (plotH * g) / 4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + plotW, y); ctx.stroke();
    ctx.fillText(String(Math.round((mx * (4 - g)) / 4)), x0 - 8, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const n = d.labels.length || 1;
  const step = plotW / n;
  d.labels.forEach((lb, i) => ctx.fillText(lb, x0 + step * i + step / 2, y0 + 8));

  const ns = d.series.length;
  if (type === 'stacked') {
    // Stacked bars: per-label cumulative sum, scaled to the max stack total.
    const stackMax = Math.max(1, ...d.labels.map((_, i) => d.series.reduce((a, s) => a + (s.values[i] || 0), 0)));
    const barW = step * 0.6;
    d.labels.forEach((_, i) => {
      let acc = 0;
      d.series.forEach((s, si) => {
        const v = s.values[i] || 0; const h = (v / stackMax) * plotH;
        const bx = x0 + step * i + (step - barW) / 2;
        ctx.fillStyle = PALETTE[si % PALETTE.length];
        ctx.fillRect(bx, y0 - acc - h, barW, h);
        acc += h;
      });
    });
    drawSeriesLegend(ctx, d, x0, top);
  } else if (type === 'hbar') {
    // Horizontal bars (first series), labels on the left.
    const s = d.series[0]; if (!s) return;
    const rowH = plotH / (d.labels.length || 1);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    d.labels.forEach((lb, i) => {
      const v = s.values[i] || 0; const w = (v / mx) * plotW;
      const by = top + rowH * i + rowH * 0.15;
      ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fillRect(x0, by, w, rowH * 0.7);
      ctx.fillStyle = '#333'; ctx.font = '12px system-ui, Arial, sans-serif';
      ctx.fillText(lb, x0 - 6, by + rowH * 0.35);
      ctx.textAlign = 'left'; ctx.fillText(String(v), x0 + w + 6, by + rowH * 0.35); ctx.textAlign = 'right';
    });
    ctx.textAlign = 'left';
  } else if (type === 'bar') {
    const groupW = step * 0.7, barW = groupW / ns;
    d.series.forEach((s, si) => {
      ctx.fillStyle = PALETTE[si % PALETTE.length];
      s.values.forEach((v, i) => {
        const h = (v / mx) * plotH;
        const bx = x0 + step * i + (step - groupW) / 2 + barW * si;
        ctx.fillRect(bx, y0 - h, barW - 2, h);
      });
    });
    drawSeriesLegend(ctx, d, x0, top);
  } else if (type === 'scatter') {
    d.series.forEach((s, si) => {
      ctx.fillStyle = PALETTE[si % PALETTE.length];
      s.values.forEach((v, i) => {
        const px = x0 + step * i + step / 2, py = y0 - (v / mx) * plotH;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      });
    });
    drawSeriesLegend(ctx, d, x0, top);
  } else {
    d.series.forEach((s, si) => {
      const col = PALETTE[si % PALETTE.length];
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const px = x0 + step * i + step / 2, py = y0 - (v / mx) * plotH;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      if (type === 'area') {
        ctx.lineTo(x0 + step * (n - 1) + step / 2, y0); ctx.lineTo(x0 + step / 2, y0); ctx.closePath();
        ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath();
        s.values.forEach((v, i) => { const px = x0 + step * i + step / 2, py = y0 - (v / mx) * plotH; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
      }
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = col;
      s.values.forEach((v, i) => { const px = x0 + step * i + step / 2, py = y0 - (v / mx) * plotH; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill(); });
    });
    drawSeriesLegend(ctx, d, x0, top);
  }
}

function drawSeriesLegend(ctx: CanvasRenderingContext2D, d: Data, x0: number, top: number) {
  ctx.font = '13px system-ui, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  d.series.forEach((s, si) => {
    ctx.fillStyle = PALETTE[si % PALETTE.length]; ctx.fillRect(x0 + si * 130, top - 18, 12, 12);
    ctx.fillStyle = '#333'; ctx.fillText(s.name, x0 + si * 130 + 18, top - 12);
  });
}

function buildSvg(d: Data, type: ChartType, title: string): string {
  // simple vector mirror (bar/pie/line) — labels + values
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`];
  if (title) parts.push(`<text x="${PAD}" y="40" font-family="sans-serif" font-size="24" font-weight="bold">${esc(title)}</text>`);
  const top = title ? 60 : 30, plotW = W - PAD * 2, plotH = H - top - PAD, x0 = PAD, y0 = top + plotH;
  if (type === 'pie' || type === 'donut') {
    const s = d.series[0]; const total = s ? s.values.reduce((a, b) => a + b, 0) || 1 : 1;
    const cx = W / 2, cy = top + plotH / 2, rad = Math.min(plotW, plotH) / 2.4; let ang = -Math.PI / 2;
    s?.values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2; const x1 = cx + rad * Math.cos(ang), y1 = cy + rad * Math.sin(ang);
      ang += slice; const x2 = cx + rad * Math.cos(ang), y2 = cy + rad * Math.sin(ang);
      parts.push(`<path d="M${cx} ${cy} L${x1} ${y1} A${rad} ${rad} 0 ${slice > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z" fill="${PALETTE[i % PALETTE.length]}"/>`);
    });
  } else {
    const mx = maxVal(d), n = d.labels.length || 1, step = plotW / n, ns = d.series.length;
    if (type === 'bar') {
      const groupW = step * 0.7, barW = groupW / ns;
      d.series.forEach((s, si) => s.values.forEach((v, i) => {
        const h = (v / mx) * plotH, bx = x0 + step * i + (step - groupW) / 2 + barW * si;
        parts.push(`<rect x="${bx.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${PALETTE[si % PALETTE.length]}"/>`);
      }));
    } else {
      d.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${(x0 + step * i + step / 2).toFixed(1)},${(y0 - (v / mx) * plotH).toFixed(1)}`).join(' ');
        parts.push(`<polyline points="${pts}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2.5"/>`);
      });
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

export default function ChartMakerUI() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [raw, setRaw] = React.useState(SAMPLE);
  const [type, setType] = React.useState<ChartType>('bar');
  const [title, setTitle] = React.useState('Monthly performance');

  const data = React.useMemo(() => parseData(raw), [raw]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    drawChart(ctx, data, type, title);
  }, [data, type, title]);

  const importCsv = async (file: File) => { setRaw(await file.text()); };

  const downloadPng = async () => {
    const c = canvasRef.current; if (!c) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'rows', value: data.labels.length },
    ]);
    if (!ok) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = 'chart.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setRecent('studio-chart', 'chart.png');
  };
  const downloadSvg = async () => {
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'rows', value: data.labels.length },
    ]);
    if (!ok) return;
    const blob = new Blob([brandSvg(buildSvg(data, type, title))], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'chart.svg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const TYPES: Array<{ id: ChartType; icon: React.ReactNode; label: string }> = [
    { id: 'bar', icon: <BarChart3 className="h-4 w-4" />, label: 'Bar' },
    { id: 'stacked', icon: <BarChart3 className="h-4 w-4" />, label: 'Stacked' },
    { id: 'hbar', icon: <BarChart3 className="h-4 w-4 rotate-90" />, label: 'H-Bar' },
    { id: 'line', icon: <LineChart className="h-4 w-4" />, label: 'Line' },
    { id: 'area', icon: <AreaChart className="h-4 w-4" />, label: 'Area' },
    { id: 'scatter', icon: <LineChart className="h-4 w-4" />, label: 'Scatter' },
    { id: 'pie', icon: <PieChart className="h-4 w-4" />, label: 'Pie' },
    { id: 'donut', icon: <PieChart className="h-4 w-4" />, label: 'Donut' },
  ];
  const labelCls = 'text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {policyGate.element}
      <div className="space-y-3">
        <div className="border border-black/[0.08] bg-white p-3">
          <canvas ref={canvasRef} width={W} height={H} className="h-auto w-full" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={downloadPng} className="flex flex-1 items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110"><Download className="h-3.5 w-3.5" /> PNG</button>
          <button type="button" onClick={downloadSvg} className="flex flex-1 items-center justify-center gap-2 border border-black/[0.08] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Download className="h-3.5 w-3.5" /> SVG</button>
        </div>
      </div>

      <aside className="space-y-4">
        <div>
          <div className={labelCls}>Chart type</div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-1 border py-2 text-[10px] font-bold uppercase transition ${type === t.id ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <div className={labelCls}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 text-[13px] text-[var(--color-fg)] outline-none" />
        </label>
        <label className="block">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Data (CSV)</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[11px] font-bold uppercase text-[var(--color-cat-generator)]"><Upload className="h-3 w-3" /> Import</button>
          </div>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10} spellCheck={false}
            className="mt-1 w-full resize-none border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); }} />
        </label>
        <p className="text-[11px] text-[var(--color-fg-subtle)]">First column = labels. Header row optional. Add more columns for multiple series.</p>
      </aside>
    </div>
  );
}
