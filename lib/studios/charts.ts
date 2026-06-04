export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'donut';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartConfig {
  type: ChartType;
  title?: string;
  labels: string[];
  series: ChartSeries[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
}

const DEFAULT_COLORS = ['#22d3ee', '#a855f7', '#f59e0b', '#22c55e', '#ec4899', '#3b82f6', '#ef4444', '#84cc16', '#06b6d4', '#f97316'];

const colorOf = (i: number, custom?: string) => custom ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];

export function renderChart(canvas: HTMLCanvasElement, config: ChartConfig): void {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const W = config.width ?? canvas.clientWidth ?? 480;
  const H = config.height ?? canvas.clientHeight ?? 320;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#a1a1aa';
  if (config.title) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#f4f4f5';
    ctx.textAlign = 'center';
    ctx.fillText(config.title, W / 2, 20);
  }
  switch (config.type) {
    case 'bar':     return drawBar(ctx, W, H, config);
    case 'line':    return drawLine(ctx, W, H, config, false);
    case 'area':    return drawLine(ctx, W, H, config, true);
    case 'pie':     return drawPie(ctx, W, H, config, false);
    case 'donut':   return drawPie(ctx, W, H, config, true);
    case 'scatter': return drawScatter(ctx, W, H, config);
  }
}

function plotBounds(W: number, H: number, hasTitle: boolean): { x: number; y: number; w: number; h: number } {
  const top = hasTitle ? 40 : 20;
  return { x: 56, y: top, w: W - 76, h: H - top - 56 };
}

function niceRange(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  if (min === max) { max = min + 1; }
  const range = max - min;
  const step0 = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step = mag;
  if (norm < 1.5) step = mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function drawGrid(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, ymin: number, ymax: number, ystep: number) {
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#71717a';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = ymin; v <= ymax + 0.0001; v += ystep) {
    const y = b.y + b.h - ((v - ymin) / (ymax - ymin)) * b.h;
    ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke();
    ctx.fillText(formatNum(v), b.x - 6, y);
  }
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K';
  if (Math.abs(v) < 1 && v !== 0) return v.toFixed(2);
  return String(Number(v.toFixed(2)));
}

function drawLegend(ctx: CanvasRenderingContext2D, W: number, H: number, config: ChartConfig) {
  if (config.showLegend === false || config.series.length < 2) return;
  let x = 60;
  const y = H - 18;
  ctx.font = '11px system-ui, sans-serif';
  for (let i = 0; i < config.series.length; i++) {
    const s = config.series[i];
    ctx.fillStyle = colorOf(i, s.color);
    ctx.fillRect(x, y - 4, 10, 10);
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.name, x + 14, y + 1);
    x += 14 + ctx.measureText(s.name).width + 14;
  }
}

function drawBar(ctx: CanvasRenderingContext2D, W: number, H: number, config: ChartConfig) {
  const b = plotBounds(W, H, !!config.title);
  let mn = 0, mx = 0;
  if (config.stacked) {
    for (let i = 0; i < config.labels.length; i++) {
      let s = 0;
      for (const ser of config.series) s += ser.values[i] ?? 0;
      mx = Math.max(mx, s);
    }
  } else {
    for (const ser of config.series) {
      for (const v of ser.values) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    }
  }
  const { min: ymin, max: ymax, step: ystep } = niceRange(mn, mx, 5);
  if (config.showGrid !== false) drawGrid(ctx, b, ymin, ymax, ystep);

  const groupCount = config.labels.length;
  const seriesCount = config.series.length;
  const groupW = b.w / Math.max(1, groupCount);
  const barGap = 4;
  const barW = config.stacked ? groupW * 0.7 : (groupW - barGap * (seriesCount + 1)) / Math.max(1, seriesCount);
  const zeroY = b.y + b.h - ((0 - ymin) / (ymax - ymin)) * b.h;

  if (config.stacked) {
    for (let g = 0; g < groupCount; g++) {
      let stackTop = 0;
      const x = b.x + g * groupW + (groupW - barW) / 2;
      for (let s = 0; s < seriesCount; s++) {
        const v = config.series[s].values[g] ?? 0;
        const h = (v / (ymax - ymin)) * b.h;
        const y = zeroY - stackTop - h;
        ctx.fillStyle = colorOf(s, config.series[s].color);
        ctx.fillRect(x, y, barW, h);
        stackTop += h;
      }
    }
  } else {
    for (let g = 0; g < groupCount; g++) {
      for (let s = 0; s < seriesCount; s++) {
        const v = config.series[s].values[g] ?? 0;
        const h = (v / (ymax - ymin)) * b.h;
        const x = b.x + g * groupW + barGap + s * (barW + barGap);
        const y = v >= 0 ? zeroY - h : zeroY;
        ctx.fillStyle = colorOf(s, config.series[s].color);
        ctx.fillRect(x, y, barW, Math.abs(h));
      }
    }
  }
  drawXLabels(ctx, b, config.labels);
  drawLegend(ctx, W, H, config);
}

function drawXLabels(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, labels: string[]) {
  ctx.fillStyle = '#a1a1aa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = b.w / Math.max(1, labels.length);
  const stride = Math.max(1, Math.floor(labels.length / Math.floor(b.w / 60)));
  for (let i = 0; i < labels.length; i += stride) {
    ctx.fillText(labels[i].slice(0, 12), b.x + i * step + step / 2, b.y + b.h + 6);
  }
}

function drawLine(ctx: CanvasRenderingContext2D, W: number, H: number, config: ChartConfig, fill: boolean) {
  const b = plotBounds(W, H, !!config.title);
  let mn = Infinity, mx = -Infinity;
  for (const s of config.series) for (const v of s.values) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  if (!isFinite(mn)) { mn = 0; mx = 1; }
  if (mn === mx) { mx = mn + 1; }
  const { min: ymin, max: ymax, step: ystep } = niceRange(mn, mx, 5);
  if (config.showGrid !== false) drawGrid(ctx, b, ymin, ymax, ystep);
  const n = config.labels.length;
  const step = n > 1 ? b.w / (n - 1) : b.w;
  for (let si = 0; si < config.series.length; si++) {
    const s = config.series[si];
    const color = colorOf(si, s.color);
    if (fill) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      for (let i = 0; i < n; i++) {
        const v = s.values[i] ?? 0;
        const x = b.x + i * step;
        const y = b.y + b.h - ((v - ymin) / (ymax - ymin)) * b.h;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(b.x + (n - 1) * step, b.y + b.h);
      ctx.closePath();
      ctx.fillStyle = color + '33';
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = s.values[i] ?? 0;
      const x = b.x + i * step;
      const y = b.y + b.h - ((v - ymin) / (ymax - ymin)) * b.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const v = s.values[i] ?? 0;
      const x = b.x + i * step;
      const y = b.y + b.h - ((v - ymin) / (ymax - ymin)) * b.h;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  drawXLabels(ctx, b, config.labels);
  drawLegend(ctx, W, H, config);
}

function drawPie(ctx: CanvasRenderingContext2D, W: number, H: number, config: ChartConfig, donut: boolean) {
  const cx = W / 2;
  const cy = H / 2 + (config.title ? 10 : 0);
  const radius = Math.min(W, H) / 2 - 40;
  const inner = donut ? radius * 0.55 : 0;
  const ser = config.series[0];
  if (!ser) return;
  const total = ser.values.reduce((s, v) => s + Math.abs(v), 0);
  if (!total) return;
  let angle = -Math.PI / 2;
  for (let i = 0; i < ser.values.length; i++) {
    const v = Math.abs(ser.values[i]);
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    if (inner > 0) ctx.arc(cx, cy, inner, angle + slice, angle, true);
    else ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = colorOf(i);
    ctx.fill();
    const mid = angle + slice / 2;
    const lx = cx + Math.cos(mid) * (radius * 0.75);
    const ly = cy + Math.sin(mid) * (radius * 0.75);
    if (v / total > 0.05) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(`${Math.round((v / total) * 100)}%`, lx, ly);
    }
    angle += slice;
  }
  ctx.fillStyle = '#d4d4d8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '10px system-ui, sans-serif';
  const legendX = W - 110;
  let legendY = 40;
  for (let i = 0; i < config.labels.length && i < ser.values.length; i++) {
    ctx.fillStyle = colorOf(i);
    ctx.fillRect(legendX, legendY - 4, 9, 9);
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText(config.labels[i].slice(0, 14), legendX + 14, legendY);
    legendY += 14;
  }
}

function drawScatter(ctx: CanvasRenderingContext2D, W: number, H: number, config: ChartConfig) {
  const b = plotBounds(W, H, !!config.title);
  let xmn = Infinity, xmx = -Infinity, ymn = Infinity, ymx = -Infinity;
  const xs = config.labels.map(l => parseFloat(l));
  for (const s of config.series) {
    for (let i = 0; i < s.values.length; i++) {
      const x = xs[i] ?? i;
      const y = s.values[i];
      if (isFinite(x)) { xmn = Math.min(xmn, x); xmx = Math.max(xmx, x); }
      if (isFinite(y)) { ymn = Math.min(ymn, y); ymx = Math.max(ymx, y); }
    }
  }
  const xR = niceRange(xmn, xmx, 5);
  const yR = niceRange(ymn, ymx, 5);
  drawGrid(ctx, b, yR.min, yR.max, yR.step);
  for (let si = 0; si < config.series.length; si++) {
    const s = config.series[si];
    const color = colorOf(si, s.color);
    ctx.fillStyle = color + 'aa';
    for (let i = 0; i < s.values.length; i++) {
      const x = xs[i] ?? i;
      const y = s.values[i];
      const px = b.x + ((x - xR.min) / (xR.max - xR.min)) * b.w;
      const py = b.y + b.h - ((y - yR.min) / (yR.max - yR.min)) * b.h;
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#71717a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = xR.min; v <= xR.max + 0.0001; v += xR.step) {
    const px = b.x + ((v - xR.min) / (xR.max - xR.min)) * b.w;
    ctx.fillText(formatNum(v), px, b.y + b.h + 6);
  }
  drawLegend(ctx, W, H, config);
}
