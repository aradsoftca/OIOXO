import { blankCanvas } from './canvas';

export interface LayerShadow {
  enabled: boolean;
  color: string;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface LayerGlow {
  enabled: boolean;
  color: string;
  opacity: number;
  spread: number;
  blur: number;
}

export interface LayerStroke {
  enabled: boolean;
  color: string;
  width: number;
  position: 'outside' | 'inside' | 'center';
}

export interface LayerGradient {
  enabled: boolean;
  startColor: string;
  endColor: string;
  angle: number;
  blend: GlobalCompositeOperation;
  opacity: number;
}

export interface LayerStyles {
  shadow?: LayerShadow;
  glow?: LayerGlow;
  stroke?: LayerStroke;
  gradient?: LayerGradient;
}

export const DEFAULT_SHADOW: LayerShadow = { enabled: false, color: '#000000', opacity: 0.6, blur: 10, offsetX: 4, offsetY: 4 };
export const DEFAULT_GLOW: LayerGlow = { enabled: false, color: '#ffffff', opacity: 0.7, spread: 0, blur: 20 };
export const DEFAULT_STROKE: LayerStroke = { enabled: false, color: '#000000', width: 4, position: 'outside' };
export const DEFAULT_GRADIENT: LayerGradient = { enabled: false, startColor: '#000000', endColor: 'rgba(0,0,0,0)', angle: 90, blend: 'source-over', opacity: 0.6 };

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/rgba?\(([^)]+)\)/, (_, vals) => `rgba(${vals.split(',').slice(0, 3).join(',')},${alpha})`);
  if (color.startsWith('rgb'))  return color.replace(/rgb?\(([^)]+)\)/, (_, vals) => `rgba(${vals},${alpha})`);
  const m = /^#?([0-9a-f]{6})/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function applyLayerStyles(layerCanvas: HTMLCanvasElement, styles: LayerStyles | undefined): HTMLCanvasElement {
  if (!styles || (!styles.shadow?.enabled && !styles.glow?.enabled && !styles.stroke?.enabled && !styles.gradient?.enabled)) {
    return layerCanvas;
  }
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const pad = Math.max(
    styles.shadow?.enabled ? styles.shadow.blur + Math.max(Math.abs(styles.shadow.offsetX), Math.abs(styles.shadow.offsetY)) : 0,
    styles.glow?.enabled ? styles.glow.blur + styles.glow.spread : 0,
    styles.stroke?.enabled ? styles.stroke.width : 0,
  );
  const out = blankCanvas(w + pad * 2, h + pad * 2);
  const ctx = out.getContext('2d')!;

  if (styles.shadow?.enabled) {
    const s = styles.shadow;
    ctx.save();
    ctx.shadowColor = withAlpha(s.color, s.opacity);
    ctx.shadowBlur = s.blur;
    ctx.shadowOffsetX = s.offsetX;
    ctx.shadowOffsetY = s.offsetY;
    ctx.drawImage(layerCanvas, pad, pad);
    ctx.restore();
  }

  if (styles.glow?.enabled) {
    const g = styles.glow;
    ctx.save();
    ctx.shadowColor = withAlpha(g.color, g.opacity);
    ctx.shadowBlur = g.blur;
    ctx.drawImage(layerCanvas, pad, pad);
    if (g.spread > 0) {
      ctx.drawImage(layerCanvas, pad, pad);
      ctx.drawImage(layerCanvas, pad, pad);
    }
    ctx.restore();
  }

  if (styles.stroke?.enabled) {
    const st = styles.stroke;
    const offsets = computeStrokeOffsets(st.width);
    ctx.save();
    ctx.fillStyle = st.color;
    const mask = blankCanvas(w, h);
    const mctx = mask.getContext('2d')!;
    mctx.drawImage(layerCanvas, 0, 0);
    mctx.globalCompositeOperation = 'source-in';
    mctx.fillStyle = st.color;
    mctx.fillRect(0, 0, w, h);
    for (const [dx, dy] of offsets) {
      ctx.drawImage(mask, pad + dx, pad + dy);
    }
    ctx.restore();
    if (st.position === 'inside') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(layerCanvas, pad, pad);
      ctx.restore();
    }
  }

  ctx.drawImage(layerCanvas, pad, pad);

  if (styles.gradient?.enabled) {
    const gr = styles.gradient;
    const angle = (gr.angle * Math.PI) / 180;
    const cx = pad + w / 2;
    const cy = pad + h / 2;
    const r = Math.max(w, h);
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    const x0 = cx - Math.cos(angle) * r;
    const y0 = cy - Math.sin(angle) * r;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, gr.startColor);
    grad.addColorStop(1, gr.endColor);
    const tmp = blankCanvas(out.width, out.height);
    const tctx = tmp.getContext('2d')!;
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, out.width, out.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(layerCanvas, pad, pad);
    ctx.save();
    ctx.globalAlpha = gr.opacity;
    ctx.globalCompositeOperation = gr.blend;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  return out;
}

function computeStrokeOffsets(width: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let dx = -width; dx <= width; dx++) {
    for (let dy = -width; dy <= width; dy++) {
      if (dx * dx + dy * dy <= width * width && (dx !== 0 || dy !== 0)) {
        result.push([dx, dy]);
      }
    }
  }
  return result;
}

export function layerStylesPad(styles: LayerStyles | undefined): number {
  if (!styles) return 0;
  return Math.max(
    styles.shadow?.enabled ? styles.shadow.blur + Math.max(Math.abs(styles.shadow.offsetX), Math.abs(styles.shadow.offsetY)) : 0,
    styles.glow?.enabled ? styles.glow.blur + styles.glow.spread : 0,
    styles.stroke?.enabled ? styles.stroke.width : 0,
    0,
  );
}
