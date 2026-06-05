/**
 * Copy libredwg-web's wasm into public/libredwg/ so the DWG → DXF converter can
 * fetch it from a real same-origin URL. We call LibreDwg.create('/libredwg'),
 * whose locateFile() resolves `${filepath}/libredwg-web.wasm` → /libredwg/...
 * (the package's default scriptDirectory resolution breaks under webpack).
 */
import { mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PKG = path.join(ROOT, 'node_modules', '@mlightcad', 'libredwg-web');
const WASM = path.join(PKG, 'wasm', 'libredwg-web.wasm');
// The self-contained UMD inlines the emscripten glue (8.8MB) — load it via a
// <script> tag at runtime so the 8.8MB never goes through webpack (the giant
// generated file overflows webpack's resolver). Mirrors ffmpeg/libarchive.
const UMD = path.join(PKG, 'dist', 'libredwg-web.umd.cjs');
const OUT = path.join(ROOT, 'public', 'libredwg');

async function main() {
  try { await stat(WASM); } catch { console.warn('[copy-libredwg] libredwg-web not installed — skipping.'); return; }
  await mkdir(OUT, { recursive: true });
  await copyFile(WASM, path.join(OUT, 'libredwg-web.wasm'));
  await copyFile(UMD, path.join(OUT, 'libredwg-web.umd.js'));
  console.log('[copy-libredwg] copied wasm + umd → public/libredwg/');
}

main().catch((e) => { console.error('[copy-libredwg] FAILED:', e.message || e); process.exit(1); });
