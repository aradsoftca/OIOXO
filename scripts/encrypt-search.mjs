#!/usr/bin/env node
/**
 * Server-side copy of repo-root scripts/encrypt-search.mjs (kept in sync
 * verbatim — if you edit one, edit the other). The deploy tarball only
 * carries newxonvert/, so this copy must travel with it for the server's
 * prebuild step to encrypt _oioxo_src/* into _oioxo_src/protected/*.enc.
 *
 * See repo-root scripts/encrypt-search.mjs for full docs.
 */
import { hkdfSync, createCipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROOT_OIOXO = path.join(ROOT, 'oioxo');
const SRC_OIOXO = path.join(ROOT, '_oioxo_src');
const OIOXO = existsSync(ROOT_OIOXO) ? ROOT_OIOXO : SRC_OIOXO;
const OUT = path.join(OIOXO, 'protected');
const RELEASE = process.env.TOOL_WASM_RELEASE || 'v1';
const DEV_KEY_FILE = path.join(ROOT, '.tool-wasm-key.dev');

function assetKey(master, id) {
  return Buffer.from(
    hkdfSync('sha256', master, Buffer.from(`oioxo:${RELEASE}`), Buffer.from(`asset:${id}`), 32),
  );
}

function encrypt(plain, key) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

async function resolveMaster() {
  if (process.env.TOOL_WASM_KEY) return Buffer.from(process.env.TOOL_WASM_KEY, 'base64');
  try {
    const txt = (await readFile(DEV_KEY_FILE, 'utf8')).trim();
    if (txt) return Buffer.from(txt, 'base64');
  } catch {}
  const dev = randomBytes(32);
  await writeFile(DEV_KEY_FILE, dev.toString('base64'));
  console.warn(
    '[encrypt-search] TOOL_WASM_KEY unset → wrote ephemeral dev key to .tool-wasm-key.dev (gitignored).',
  );
  return dev;
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function listJs(dir) {
  try {
    const names = await readdir(dir);
    return names.filter(n => n.endsWith('.js'));
  } catch { return []; }
}

async function main() {
  const master = await resolveMaster();
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  const items = [];

  for (const name of await listJs(path.join(OIOXO, 'engines'))) {
    const slug = name.replace(/\.js$/, '');
    items.push({ id: `engine-${slug}`, src: path.join(OIOXO, 'engines', name) });
  }
  for (const name of await listJs(path.join(OIOXO, 'skills'))) {
    const slug = name.replace(/\.js$/, '');
    items.push({ id: `skill-${slug}`, src: path.join(OIOXO, 'skills', name) });
  }
  for (const name of await listJs(path.join(OIOXO, 'router'))) {
    const slug = name.replace(/\.js$/, '');
    items.push({ id: `router-${slug}`, src: path.join(OIOXO, 'router', name) });
  }
  if (await fileExists(path.join(OIOXO, 'catalog.json'))) {
    items.push({ id: 'catalog', src: path.join(OIOXO, 'catalog.json') });
  }
  const providersPath = path.join(OIOXO, 'search-providers.js');
  if (await fileExists(providersPath)) {
    items.push({ id: 'search-providers', src: providersPath });
  }

  for (const { id, src } of items) {
    const plain = await readFile(src);
    const enc = encrypt(plain, assetKey(master, id));
    const outName = `${id}.enc`;
    await writeFile(path.join(OUT, outName), enc);
    manifest[id] = {
      file: outName,
      bytes: enc.length,
      plainBytes: plain.length,
      sha256: createHash('sha256').update(enc).digest('hex').slice(0, 16),
    };
    console.log(
      `[encrypt-search] ${id}: ${(plain.length / 1024).toFixed(1)}KB → ${(enc.length / 1024).toFixed(1)}KB enc`,
    );
  }
  await writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ release: RELEASE, generated: new Date().toISOString(), assets: manifest }, null, 2),
  );
  console.log(`[encrypt-search] release=${RELEASE}, ${items.length} assets → ${path.relative(ROOT, OUT)}/`);
}

main().catch((e) => {
  console.error('[encrypt-search] FAILED:', e.message || e);
  process.exit(1);
});
