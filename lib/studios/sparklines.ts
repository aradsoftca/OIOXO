export type SparkType = 'line' | 'bar' | 'area' | 'winloss';

export interface SparkConfig {
  type: SparkType;
  values: number[];
  color?: string;
  posColor?: string;
  negColor?: string;
  width?: number;
  height?: number;
  showMarkers?: boolean;
}

export function renderSparkline(canvas: HTMLCanvasElement, config: SparkConfig): void {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const W = config.width ?? canvas.clientWidth ?? 80;
  const H = config.height ?? canvas.clientHeight ?? 20;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const values = config.values;
  if (!values.length) return;

  switch (config.type) {
    case 'line':    return drawLineSpark(ctx, W, H, values, config);
    case 'area':    return drawAreaSpark(ctx, W, H, values, config);
    case 'bar':     return drawBarSpark(ctx, W, H, values, config);
    case 'winloss': return drawWinLossSpark(ctx, W, H, values, config);
  }
}

function drawLineSpark(ctx: CanvasRenderingContext2D, W: number, H: number, values: number[], config: SparkConfig): void {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const color = config.color ?? '#22d3ee';
  const stepX = W / Math.max(1, values.length - 1);
  const margin = 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = i * stepX;
    const y = margin + (H - margin * 2) * (1 - (values[i] - min) / range);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (config.showMarkers) {
    ctx.fillStyle = color;
    for (let i = 0; i < values.length; i++) {
      const x = i * stepX;
      const y = margin + (H - margin * 2) * (1 - (values[i] - min) / range);
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawAreaSpark(ctx: CanvasRenderingContext2D, W: number, H: number, values: number[], config: SparkConfig): void {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const color = config.color ?? '#22d3ee';
  const stepX = W / Math.max(1, values.length - 1);
  const margin = 2;
  ctx.fillStyle = color + '40';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < values.length; i++) {
    const x = i * stepX;
    const y = margin + (H - margin * 2) * (1 - (values[i] - min) / range);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = i * stepX;
    const y = margin + (H - margin * 2) * (1 - (values[i] - min) / range);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawBarSpark(ctx: CanvasRenderingContext2D, W: number, H: number, values: number[], config: SparkConfig): void {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const posColor = config.posColor ?? config.color ?? '#22c55e';
  const negColor = config.negColor ?? '#ef4444';
  const stepX = W / values.length;
  const barW = Math.max(1, stepX * 0.7);
  const gap = (stepX - barW) / 2;
  const zeroY = H * (1 - (-min) / range);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const y = H * (1 - (v - min) / range);
    const x = i * stepX + gap;
    ctx.fillStyle = v >= 0 ? posColor : negColor;
    if (v >= 0) ctx.fillRect(x, y, barW, zeroY - y);
    else ctx.fillRect(x, zeroY, barW, y - zeroY);
  }
}

function drawWinLossSpark(ctx: CanvasRenderingContext2D, W: number, H: number, values: number[], config: SparkConfig): void {
  const posColor = config.posColor ?? '#22c55e';
  const negColor = config.negColor ?? '#ef4444';
  const stepX = W / values.length;
  const barW = Math.max(1, stepX * 0.7);
  const gap = (stepX - barW) / 2;
  const mid = H / 2;
  const barH = H * 0.35;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const x = i * stepX + gap;
    if (v > 0) { ctx.fillStyle = posColor; ctx.fillRect(x, mid - barH, barW, barH); }
    else if (v < 0) { ctx.fillStyle = negColor; ctx.fillRect(x, mid, barW, barH); }
    else { ctx.fillStyle = '#666'; ctx.fillRect(x, mid - 1, barW, 2); }
  }
}

export function parseSparkValues(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[,\s;]+/)) {
    const n = parseFloat(part);
    if (!isNaN(n)) out.push(n);
  }
  return out;
}
