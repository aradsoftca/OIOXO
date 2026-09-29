/**
 * WOFF2 ⇄ SFNT (TTF/OTF) via `wawoff2` — Google's reference woff2 encoder/
 * decoder compiled to WebAssembly (Brotli + glyf/loca transforms). Runs in the
 * browser; only loaded when a WOFF2 conversion is requested.
 */
type Wawoff2 = { compress: (b: Uint8Array) => Promise<Uint8Array>; decompress: (b: Uint8Array) => Promise<Uint8Array> };

let lib: Promise<Wawoff2> | null = null;
function wawoff2(): Promise<Wawoff2> {
  if (!lib) {
    lib = import('wawoff2').then((m) => ((m as unknown as { default?: Wawoff2 }).default ?? (m as unknown as Wawoff2)));
    lib.catch(() => { lib = null; });
  }
  return lib;
}

/** TTF/OTF bytes → WOFF2. */
export async function sfntToWoff2(sfnt: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await (await wawoff2()).compress(sfnt));
}

/** WOFF2 bytes → TTF/OTF (flavor read from the restored header). */
export async function woff2ToSfnt(bytes: Uint8Array): Promise<{ font: Uint8Array; flavor: 'ttf' | 'otf' }> {
  const font = new Uint8Array(await (await wawoff2()).decompress(bytes));
  if (font.length < 12) throw new Error('This WOFF2 file could not be decoded.');
  const sig = new DataView(font.buffer, font.byteOffset, 4).getUint32(0);
  return { font, flavor: sig === 0x4f54544f ? 'otf' : 'ttf' };
}
