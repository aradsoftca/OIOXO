/**
 * Copy jsquash's runtime assets (codec .wasm + the multi-thread .worker.mjs)
 * FLAT into public/jsquash/ so the encrypted image/codec workers can fetch them
 * from a real same-origin URL.
 *
 * Why: jsquash's emscripten glue resolves its wasm with
 * `new URL("x.wasm", import.meta.url)`. In a normal webpack worker import.meta.url
 * is a real /_next URL; in our decrypted BLOB worker it isn't, so we point
 * import.meta.url at `{origin}/jsquash/` (encrypt-workers.mjs define +
 * protected-worker.ts banner) and serve every jsquash asset from that one dir.
 * Filenames are globally unique across @jsquash/*, so a flat dir is safe.
 */
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'node_modules', '@jsquash');
const OUT = path.join(ROOT, 'public', 'jsquash');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    // *_mt.js: the multi-thread worker (e.g. avif_enc_mt.worker.mjs) dynamically
    // imports its Emscripten glue from the same dir — without it every PNG→AVIF
    // failed with "Failed to fetch dynamically imported module" (measured 09-30).
    else if (name.endsWith('.wasm') || name.endsWith('.worker.mjs') || /_mt\.js$/.test(name)) out.push(p);
  }
  return out;
}

async function main() {
  try { await stat(SRC); } catch { console.warn('[copy-jsquash] @jsquash not installed — skipping.'); return; }
  await mkdir(OUT, { recursive: true });
  const files = await walk(SRC);
  for (const f of files) await copyFile(f, path.join(OUT, path.basename(f)));
  console.log(`[copy-jsquash] copied ${files.length} assets → public/jsquash/`);
}

main().catch((e) => { console.error('[copy-jsquash] FAILED:', e.message || e); process.exit(1); });
