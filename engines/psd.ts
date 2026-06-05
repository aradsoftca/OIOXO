/**
 * Photoshop (.psd / .psb) → flat raster image, entirely in the browser.
 *
 * ag-psd decodes the PSD and renders the merged composite the file already
 * stores into a <canvas> (so we don't have to re-blend every layer). From there
 * it bridges to the rest of the matrix: PSD → png/jpg/webp, and via those to
 * pdf / video too.
 */

/** Decode a PSD/PSB to a real DOM ImageData (the flattened composite). */
export async function psdToImageData(file: File): Promise<ImageData> {
  const { readPsd } = await import('ag-psd');
  const buf = await file.arrayBuffer();
  // skipLayerImageData/skipThumbnail: keep ONLY the merged composite — far less work.
  const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true });
  if (!psd.canvas) throw new Error('PSD has no composite image');
  const ctx = psd.canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return ctx.getImageData(0, 0, psd.width, psd.height);
}

/** Encode a decoded PSD to png/jpg/webp via the shared jsquash codec. */
export async function psdToImage(file: File, to: 'png' | 'jpg' | 'webp', quality = 92): Promise<Blob> {
  const imageData = await psdToImageData(file);
  let data = imageData;
  // jpg has no alpha — flatten onto white before encoding.
  if (to === 'jpg') {
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width; tmp.height = imageData.height;
    tmp.getContext('2d')!.putImageData(imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0); // blends alpha over white
    data = ctx.getImageData(0, 0, c.width, c.height);
  }
  const { encode } = await import('@/engines/image');
  const fmt = (to === 'jpg' ? 'jpeg' : to) as 'png' | 'jpeg' | 'webp';
  const { blob } = await encode(data, fmt, { quality });
  return blob;
}
