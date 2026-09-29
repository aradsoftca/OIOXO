/**
 * Browser half of the .ani converter: decoded frames → canvas → PNG / animated
 * GIF (gif.js, same worker as the video → GIF tool). Parsing lives in ./ani.
 */
import { bestEntry, decodeEntry, parseAni, parseIco } from '@/lib/convert/formats/ani';

async function frameCanvas(frame: Uint8Array): Promise<HTMLCanvasElement> {
  const dec = decodeEntry(bestEntry(parseIco(frame)));
  const c = document.createElement('canvas');
  if (dec.kind === 'png') {
    const bm = await createImageBitmap(new Blob([dec.png as BlobPart], { type: 'image/png' }));
    c.width = bm.width; c.height = bm.height;
    c.getContext('2d')!.drawImage(bm, 0, 0); bm.close();
  } else {
    c.width = dec.width; c.height = dec.height;
    c.getContext('2d')!.putImageData(new ImageData(dec.rgba, dec.width, dec.height), 0, 0);
  }
  return c;
}

const toPng = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('PNG encode failed'))), 'image/png'));

/** First frame of the animation as a transparent PNG. */
export async function aniToPng(bytes: Uint8Array): Promise<Blob> {
  const ani = parseAni(bytes);
  return toPng(await frameCanvas(ani.frames[ani.sequence[0] ?? 0]));
}

/** GIF has 1-bit transparency: this colour is reserved as the transparent key. */
const KEY = [0xff, 0x00, 0xff] as const;

interface GifInstance {
  addFrame: (canvas: HTMLCanvasElement, opts: { delay: number; copy: boolean }) => void;
  on: (event: string, cb: (arg: Blob) => void) => void;
  render: () => void;
}

/** Every step of the animation, with its own timing, as a looping transparent GIF. */
export async function aniToGif(bytes: Uint8Array): Promise<Blob> {
  const ani = parseAni(bytes);
  const decoded = await Promise.all(ani.frames.map(frameCanvas));
  const W = Math.max(...decoded.map((c) => c.width));
  const H = Math.max(...decoded.map((c) => c.height));
  // Flatten alpha to the key colour (alpha < 50% → transparent, else opaque).
  const flat = decoded.map((src) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i] = KEY[0]; d[i + 1] = KEY[1]; d[i + 2] = KEY[2]; }
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
  const { niceThreadCount } = await import('@/lib/compute/concurrency');
  const mod = await import('gif.js');
  const GIFEnc = (mod as unknown as { default: new (opts: Record<string, unknown>) => GifInstance }).default;
  return new Promise<Blob>((resolve, reject) => {
    const gif = new GIFEnc({
      workers: niceThreadCount(), quality: 1, width: W, height: H,
      workerScript: '/gif.worker.js', transparent: (KEY[0] << 16) | (KEY[1] << 8) | KEY[2],
    });
    ani.sequence.forEach((f, step) => {
      // Jiffies are 1/60 s; GIF delays are 1/100 s, and browsers clamp < 20 ms.
      gif.addFrame(flat[f], { delay: Math.max(20, Math.round((ani.rates[step] * 1000) / 60)), copy: true });
    });
    gif.on('finished', (blob: Blob) => resolve(blob));
    gif.on('abort', () => reject(new Error('GIF aborted')));
    gif.render();
  });
}
