/**
 * AutoCAD .dwg → .dxf, entirely in the browser, via LibreDWG compiled to WASM
 * (@mlightcad/libredwg-web). DWG is a closed binary format; LibreDWG reads it
 * and re-serializes to DXF (the open ASCII interchange format) — which then
 * bridges to the rest of the CAD/3D matrix.
 *
 * The library's self-contained UMD (8.8MB, emscripten glue inlined) is loaded
 * from /libredwg/ via a <script> tag at RUNTIME rather than bundled: that giant
 * generated file overflows webpack's module resolver at build time. The wasm is
 * fetched by the glue's locateFile() from the same /libredwg/ dir. This mirrors
 * how ffmpeg.wasm and libarchive.js are served from /public here.
 */

interface DwgLib { dwg_write_dxf(buf: ArrayBuffer): Uint8Array | null }
interface LibreDwgStatic { create(filepath?: string): Promise<DwgLib> }

declare global {
  interface Window { 'libredwg-web'?: { LibreDwg: LibreDwgStatic } }
}

let scriptP: Promise<LibreDwgStatic> | null = null;
let instP: Promise<DwgLib> | null = null;

function loadScript(): Promise<LibreDwgStatic> {
  if (scriptP) return scriptP;
  const p = new Promise<LibreDwgStatic>((resolve, reject) => {
    const ready = window['libredwg-web'];
    if (ready?.LibreDwg) return resolve(ready.LibreDwg);
    const s = document.createElement('script');
    s.src = '/libredwg/libredwg-web.umd.js';
    s.async = true;
    s.onload = () => {
      const g = window['libredwg-web'];
      if (g?.LibreDwg) resolve(g.LibreDwg);
      else reject(new Error('libredwg failed to initialise'));
    };
    s.onerror = () => reject(new Error('Could not load the DWG engine'));
    document.head.appendChild(s);
  });
  // Drop the cache on failure so a transient script-load drop doesn't
  // permanently break DWG conversion for the rest of the page lifetime.
  p.catch(() => { scriptP = null; });
  scriptP = p;
  return p;
}

async function lib(): Promise<DwgLib> {
  if (!instP) {
    const p = (async () => {
      const LibreDwg = await loadScript();
      return LibreDwg.create('/libredwg');
    })();
    p.catch(() => { instP = null; });
    instP = p;
  }
  return instP;
}

/** Convert a .dwg file to .dxf bytes. */
export async function dwgToDxf(file: File): Promise<Blob> {
  const dwg = await lib();
  const dxf = dwg.dwg_write_dxf(await file.arrayBuffer());
  if (!dxf) throw new Error('Could not read this DWG (unsupported version?)');
  return new Blob([new Uint8Array(dxf)], { type: 'application/dxf' });
}
