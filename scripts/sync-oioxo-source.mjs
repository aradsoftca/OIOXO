#!/usr/bin/env node
/**
 * Mirror the repo-root oioxo/ source into newxonvert/_oioxo_src/ so the
 * deploy tarball (PROJECT = newxonvert/) carries the search-engine source
 * files into the server, where encrypt-search.mjs + copy-oioxo-static.mjs
 * then materialise public/{search.html,loader.js,sw.js,protected/*.enc}.
 *
 * Sources copied (everything encrypt-search needs):
 *   - search.html · loader.js · sw.js · icon.svg · manifest.webmanifest
 *   - engines/*.js · skills/*.js · router/*.js
 *   - catalog.json · search-providers.js
 *
 * NOT copied:
 *   - protected/*.enc — regenerated on the server with the real master key
 *   - DEPLOY_CHECKLIST.md / DESIGN.md / _test_* — dev-only docs/screenshots
 *
 * Idempotent. Wipes _oioxo_src/ before copy so removed files don't linger.
 */
import { mkdir, readdir, copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWXONVERT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(NEWXONVERT, '..');
const SRC = path.join(REPO_ROOT, 'oioxo');
const DST = path.join(NEWXONVERT, '_oioxo_src');

const TOP_LEVEL = [
  'search.html', 'loader.js', 'sw.js', 'icon.svg', 'manifest.webmanifest',
  'catalog.json', 'search-providers.js',
];
const SUBDIRS = ['engines', 'skills', 'router'];

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  let n = 0;
  for (const name of await readdir(src)) {
    if (!name.endsWith('.js')) continue;
    await copyFile(path.join(src, name), path.join(dst, name));
    n++;
  }
  return n;
}

async function main() {
  // On the server the project is deployed at /root/oioxo, so SRC=/root/oioxo
  // resolves to the SAME directory as NEWXONVERT — there's no separate
  // ../oioxo sibling. Detect that case and skip cleanly: the deploy tarball
  // already carries _oioxo_src/.
  const sameAsNewxonvert = path.resolve(SRC) === path.resolve(NEWXONVERT);
  if (sameAsNewxonvert || !(await exists(SRC)) || !(await exists(path.join(SRC, 'search.html')))) {
    if (await exists(DST)) {
      console.log(`[sync-oioxo-source] skipping (no sibling oioxo/) — using existing ${path.relative(NEWXONVERT, DST)}`);
      return;
    }
    console.error(`[sync-oioxo-source] no sibling oioxo/ AND no ${path.relative(NEWXONVERT, DST)} present`);
    process.exit(1);
  }
  await rm(DST, { recursive: true, force: true });
  await mkdir(DST, { recursive: true });
  for (const name of TOP_LEVEL) {
    const s = path.join(SRC, name);
    if (!(await exists(s))) {
      console.error(`[sync-oioxo-source] MISSING ${s}`);
      process.exit(1);
    }
    await copyFile(s, path.join(DST, name));
  }
  let counts = {};
  for (const sub of SUBDIRS) {
    const n = await copyDir(path.join(SRC, sub), path.join(DST, sub));
    counts[sub] = n;
  }
  console.log(`[sync-oioxo-source] mirrored to ${path.relative(NEWXONVERT, DST)} — top=${TOP_LEVEL.length} ${Object.entries(counts).map(([k,v]) => `${k}=${v}`).join(' ')}`);
}

main().catch((e) => { console.error('[sync-oioxo-source] FAILED:', e.message || e); process.exit(1); });
