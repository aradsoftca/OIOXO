export const blankCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

export const cloneCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const c = blankCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
};

export const canvasToDataUrl = (c: HTMLCanvasElement): string => c.toDataURL('image/png');

export async function canvasFromDataUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = url;
  });
  const c = blankCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

export async function fileToCanvas(file: File | Blob, maxSide = 8192): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('image decode failed'));
      img.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    if (Math.max(w, h) > maxSide) {
      const s = maxSide / Math.max(w, h);
      w = Math.round(w * s); h = Math.round(h * s);
    }
    const c = blankCanvas(w, h);
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface AdjustParams {
  brightness: number; contrast: number; saturate: number;
  hue: number; blur: number;
  grayscale: number; sepia: number; invert: number;
}

export const ZERO_ADJUST: AdjustParams = {
  brightness: 100, contrast: 100, saturate: 100,
  hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0,
};

export const adjustToFilter = (a: AdjustParams): string =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg) grayscale(${a.grayscale}%) sepia(${a.sepia}%) invert(${a.invert}%) blur(${a.blur}px)`;

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

export function applyCurves(data: Uint8ClampedArray, lut: Uint8ClampedArray | [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray]): void {
  if (Array.isArray(lut)) {
    const [lr, lg, lb] = lut;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lr[data[i]];
      data[i + 1] = lg[data[i + 1]];
      data[i + 2] = lb[data[i + 2]];
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }
}

export function buildCurveLut(points: { x: number; y: number }[]): Uint8ClampedArray {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  for (let x = 0; x < 256; x++) {
    let p0 = sorted[0], p1 = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (x >= sorted[i].x && x <= sorted[i + 1].x) { p0 = sorted[i]; p1 = sorted[i + 1]; break }
    }
    const t = p1.x === p0.x ? 0 : (x - p0.x) / (p1.x - p0.x);
    lut[x] = Math.max(0, Math.min(255, p0.y + (p1.y - p0.y) * t));
  }
  return lut;
}

export function convolve3x3(data: Uint8ClampedArray, w: number, h: number, k: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let s = 0;
        s += data[o - w * 4 - 4 + c] * k[0] + data[o - w * 4 + c] * k[1] + data[o - w * 4 + 4 + c] * k[2];
        s += data[o - 4 + c] * k[3] + data[o + c] * k[4] + data[o + 4 + c] * k[5];
        s += data[o + w * 4 - 4 + c] * k[6] + data[o + w * 4 + c] * k[7] + data[o + w * 4 + 4 + c] * k[8];
        out[o + c] = Math.max(0, Math.min(255, s));
      }
    }
  }
  return out;
}

export const KERNELS = {
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  edge: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  blurBox: [1/9, 1/9, 1/9, 1/9, 1/9, 1/9, 1/9, 1/9, 1/9],
};

export function gaussianBlur(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius <= 0) return cloneCanvas(src);
  const dst = blankCanvas(src.width, src.height);
  const ctx = dst.getContext('2d')!;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return dst;
}

export function flattenLayers(layers: { canvas: HTMLCanvasElement; visible: boolean; opacity: number; blend: GlobalCompositeOperation; x?: number; y?: number; mask?: HTMLCanvasElement }[], w: number, h: number, bg = 'transparent'): HTMLCanvasElement {
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h) }
  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    if (l.mask) {
      const tmp = blankCanvas(w, h);
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(l.canvas, l.x ?? 0, l.y ?? 0);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(l.mask, 0, 0, w, h);
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(l.canvas, l.x ?? 0, l.y ?? 0);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return out;
}
