import type { ResizeOptions } from './types';

/**
 * High-quality resize using lanczos3 / mitchell / catrom kernels. Falls back to
 * canvas resampling for tiny outputs where the precision doesn't pay for the WASM load.
 */
export async function resize(data: ImageData, opts: ResizeOptions): Promise<ImageData> {
  const w = Math.max(1, Math.round(opts.width));
  const h = Math.max(1, Math.round(opts.height));
  if (w === data.width && h === data.height) return data;

  const m = await import('@jsquash/resize');
  return m.default(data, {
    width: w,
    height: h,
    method: opts.method ?? 'lanczos3',
    premultiply: opts.premultiply ?? true,
    linearRGB: opts.linearRgb ?? true,
  });
}
