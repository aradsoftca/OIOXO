/**
 * Image Blur worker — runs OffscreenCanvas off the main thread.
 *
 * Phase 0 uses CanvasRenderingContext2D.filter = "blur(Npx)" which is
 * GPU-accelerated in Chromium and Safari. A WebGPU compute-shader path can
 * replace this later for >2x speed and bigger images, behind the same RPC.
 */

export interface BlurRequest {
  type: 'blur';
  bitmap: ImageBitmap;
  blurPx: number;
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
}

export interface BlurResult {
  type: 'blur-result';
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

export interface BlurError {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<BlurRequest>) => {
  const msg = e.data;
  if (msg.type !== 'blur') return;

  try {
    const { bitmap, blurPx, format, quality } = msg;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

    if (blurPx > 0) {
      ctx.filter = `blur(${blurPx}px)`;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: format, quality: quality / 100 });

    const result: BlurResult = {
      type: 'blur-result',
      blob,
      width: canvas.width,
      height: canvas.height,
      bytes: blob.size,
    };
    (self as unknown as Worker).postMessage(result);
  } catch (err) {
    const error: BlurError = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(error);
  }
};
