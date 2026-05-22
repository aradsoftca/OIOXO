import type { ImageFormat } from './types';

/**
 * Sniff the image format from the first bytes of a blob. Cheap and synchronous-ish.
 * Returns null for unknown / GIF / BMP / TIFF — caller can fall back to `createImageBitmap`.
 */
export async function detectFormat(blob: Blob): Promise<ImageFormat | null> {
  const buf = await blob.slice(0, 16).arrayBuffer();
  const b = new Uint8Array(buf);
  if (b.length < 12) return null;

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';

  // WebP: "RIFF....WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'webp';

  // AVIF: "....ftypavif" / "ftypavis" / "ftypmif1" with avif-related brands.
  // Match ftyp marker at offset 4 and 'avi' magic somewhere in next 8 bytes.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    // Look at major brand at offset 8..12
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') return 'avif';
  }

  return null;
}
