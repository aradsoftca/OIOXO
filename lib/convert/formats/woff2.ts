/**
 * WOFF2 ⇄ SFNT (TTF/OTF) via `wawoff2` — Google's reference woff2 encoder/
 * decoder compiled to WebAssembly (Brotli + glyf/loca transforms). Runs in the
 * browser; only loaded when a WOFF2 conversion is requested.
 */
// wawoff2's own wrapper sets onRuntimeInitialized AFTER requiring the Emscripten
// module; in the browser bundle the embedded wasm can finish first, so its promise
// never resolved ("Converting to WOFF2…" forever). Use the bindings directly and
// resolve on whichever comes first: already initialised, or the callback.
type EmModule = { calledRun?: boolean; onRuntimeInitialized?: () => void; compress?: (b: Uint8Array) => Uint8Array | false; decompress?: (b: Uint8Array) => Uint8Array | false };

function ready(mod: Promise<unknown>): Promise<EmModule> {
  return mod.then((m) => {
    const em = ((m as { default?: EmModule }).default ?? m) as EmModule;
    if (em.calledRun) return em;
    return new Promise<EmModule>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The WOFF2 engine failed to start.')), 20_000);
      const prev = em.onRuntimeInitialized;
      em.onRuntimeInitialized = () => { clearTimeout(t); prev?.(); resolve(em); };
      if (em.calledRun) { clearTimeout(t); resolve(em); }
    });
  });
}

let enc: Promise<EmModule> | null = null;
let dec: Promise<EmModule> | null = null;
const encoder = () => (enc ??= ready(import('wawoff2/build/compress_binding.js')).catch((e) => { enc = null; throw e; }));
const decoder = () => (dec ??= ready(import('wawoff2/build/decompress_binding.js')).catch((e) => { dec = null; throw e; }));

/** TTF/OTF bytes → WOFF2. */
export async function sfntToWoff2(sfnt: Uint8Array): Promise<Uint8Array> {
  const out = (await encoder()).compress!(sfnt);
  if (out === false) throw new Error('This font could not be compressed to WOFF2.');
  return new Uint8Array(out);
}

/** WOFF2 bytes → TTF/OTF (flavor read from the restored header). */
export async function woff2ToSfnt(bytes: Uint8Array): Promise<{ font: Uint8Array; flavor: 'ttf' | 'otf' }> {
  const raw = (await decoder()).decompress!(bytes);
  if (raw === false) throw new Error('This WOFF2 file could not be decoded.');
  const font = new Uint8Array(raw);
  if (font.length < 12) throw new Error('This WOFF2 file could not be decoded.');
  const sig = new DataView(font.buffer, font.byteOffset, 4).getUint32(0);
  return { font, flavor: sig === 0x4f54544f ? 'otf' : 'ttf' };
}
