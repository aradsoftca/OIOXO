#!/usr/bin/env node
/**
 * Copy the static oioxo search engine assets from ../oioxo into ./public so
 * Next.js serves them at the root of oioxo.com.
 *
 * Inputs (read from repo-root ../oioxo):
 *   search.html · loader.js · sw.js · icon.svg · manifest.webmanifest · serve.json
 *   protected/*.enc                  (re-encrypted by scripts/encrypt-search.mjs)
 *
 * Outputs (written to ./public):
 *   search.html · loader.js · sw.js · icon.svg · manifest.webmanifest
 *   protected/*.enc
 *
 * NOT copied:
 *   engines/*.js · skills/*.js · router/*.js · catalog.json · search-providers.js
 *   — the plaintext fallback. Keeping it out of public/ engages the ECDHE gate
 *   in production (per oioxo/DEPLOY_CHECKLIST.md §3).
 *
 * Idempotent. Wipes public/protected/ before copy so removed assets don't
 * linger.
 */
import { mkdir, readdir, copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWXONVERT = path.resolve(HERE, '..');        // .../newxonvert
const REPO_ROOT = path.resolve(NEWXONVERT, '..');   // .../xonvert
// Prefer the repo-root oioxo/ when present (local dev); fall back to
// newxonvert/_oioxo_src/ on the server (sync-oioxo-source.mjs put it there
// as part of the deploy tarball).
const ROOT_OIOXO = path.join(REPO_ROOT, 'oioxo');
const SRC_OIOXO = path.join(NEWXONVERT, '_oioxo_src');
async function pickOioxo() {
  // On the server, /root/oioxo IS the newxonvert project dir — there is no
  // separate sibling oioxo/ folder. Detect by checking that search.html is
  // actually present (it should be, in a true sibling oioxo/ — and absent
  // when ROOT_OIOXO accidentally resolves to NEWXONVERT itself).
  const sameAsNewxonvert = path.resolve(ROOT_OIOXO) === path.resolve(NEWXONVERT);
  if (!sameAsNewxonvert) {
    try {
      await stat(path.join(ROOT_OIOXO, 'search.html'));
      return ROOT_OIOXO;
    } catch {}
  }
  try { await stat(SRC_OIOXO); return SRC_OIOXO; } catch {}
  return ROOT_OIOXO;
}
let OIOXO = ROOT_OIOXO; // overwritten in main()
const PUBLIC = path.join(NEWXONVERT, 'public');

// Top-level files (must exist).
const TOP_LEVEL = [
  'search.html',
  'loader.js',
  'sw.js',
  'icon.svg',
  'manifest.webmanifest',
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function copyTopLevel() {
  for (const name of TOP_LEVEL) {
    const src = path.join(OIOXO, name);
    if (!(await exists(src))) {
      console.error(`[copy-oioxo-static] MISSING ${src} — aborting (encrypt-search may not have run, or oioxo/ is incomplete)`);
      process.exit(1);
    }
    const dst = path.join(PUBLIC, name);
    await copyFile(src, dst);
    console.log(`[copy-oioxo-static] ${name}`);
  }
}

async function copyProtected() {
  const srcDir = path.join(OIOXO, 'protected');
  const dstDir = path.join(PUBLIC, 'protected');
  if (!(await exists(srcDir))) {
    console.error(`[copy-oioxo-static] MISSING ${srcDir} — run "node scripts/encrypt-search.mjs" first`);
    process.exit(1);
  }
  // Clear OUR assets so removed ones don't linger — but NOT the tool workers
  // (*.worker.js.enc) that encrypt-workers.mjs wrote here earlier in prebuild.
  // Wiping the whole dir deleted image/codec/audio/cad/model3d workers from
  // every build, so those tools failed live with a 404 on their worker.
  await mkdir(dstDir, { recursive: true });
  for (const name of await readdir(dstDir)) {
    if (name.endsWith('.worker.js.enc')) continue;
    await rm(path.join(dstDir, name), { recursive: true, force: true });
  }
  let count = 0;
  for (const name of await readdir(srcDir)) {
    if (!name.endsWith('.enc') && name !== 'manifest.json') continue;
    await copyFile(path.join(srcDir, name), path.join(dstDir, name));
    count++;
  }
  console.log(`[copy-oioxo-static] protected/ → ${count} files`);
}

async function main() {
  OIOXO = await pickOioxo();
  if (!(await exists(OIOXO))) {
    console.error(`[copy-oioxo-static] ${OIOXO} not found — nothing to copy`);
    process.exit(1);
  }
  console.log(`[copy-oioxo-static] source: ${path.relative(REPO_ROOT, OIOXO) || OIOXO}`);
  await mkdir(PUBLIC, { recursive: true });
  await copyTopLevel();
  await copyProtected();
  console.log('[copy-oioxo-static] done');
}

main().catch((e) => {
  console.error('[copy-oioxo-static] FAILED:', e.message || e);
  process.exit(1);
});
