/**
 * Build step — bundle each heavy tool engine worker into a standalone classic
 * worker, then AES-256-GCM encrypt it to public/protected/{id}.worker.js.enc.
 *
 * The encrypted bytes are inert without the per-asset key, which the client only
 * obtains via the origin-gated ECDHE handshake at /api/tool-key (see
 * lib/protect/protected-worker.ts). Per-asset keys derive from one master
 * (TOOL_WASM_KEY, base64 of 32 bytes) + release via HKDF-SHA256 — the SAME
 * derivation as deriveAssetKey() in lib/oioxo/unlock.ts, so the server re-derives
 * the matching key. Rotate by bumping TOOL_WASM_RELEASE (a leaked key dies).
 *
 * Runs in prebuild AND predev so the .enc assets always exist. With no
 * TOOL_WASM_KEY set it generates an ephemeral DEV key and writes it to
 * .tool-wasm-key.dev so the dev server (which reads the same file) can serve the
 * matching key — local dev works without provisioning a real secret.
 */
import { build } from 'esbuild';
import { hkdfSync, createCipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd(); // run from the newxonvert project root
const OUT = path.join(ROOT, 'public', 'protected');
const RELEASE = process.env.TOOL_WASM_RELEASE || 'v1';
const DEV_KEY_FILE = path.join(ROOT, '.tool-wasm-key.dev');

/** assetId → worker entry (relative to ROOT). Keys must match ProtectedWorkerId. */
const WORKERS = {
  image: 'lib/compute/image.worker.ts',
  codec: 'lib/compute/codec.worker.ts',
  audio: 'lib/compute/audio.worker.ts',
  cad: 'engines/cad/cad.worker.ts',
  model3d: 'engines/model3d/model3d.worker.ts',
};

/** HKDF-SHA256(master, salt=`oioxo:{release}`, info=`asset:{id}`) → 32 bytes. */
function assetKey(master, id) {
  return Buffer.from(hkdfSync('sha256', master, Buffer.from(`oioxo:${RELEASE}`), Buffer.from(`asset:${id}`), 32));
}

/** Output layout: iv(12) || ciphertext || gcmTag(16) — matches the WebCrypto
 *  decrypt in protected-worker.ts (iv = slice(0,12), ct+tag = slice(12)). */
function encrypt(plain, key) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

async function resolveMaster() {
  if (process.env.TOOL_WASM_KEY) return Buffer.from(process.env.TOOL_WASM_KEY, 'base64');
  // Dev: reuse a persisted ephemeral key (so server + assets agree) or mint one.
  try { return Buffer.from((await readFile(DEV_KEY_FILE, 'utf8')).trim(), 'base64'); } catch { /* mint below */ }
  const dev = randomBytes(32);
  await writeFile(DEV_KEY_FILE, dev.toString('base64'));
  console.warn('[encrypt-workers] TOOL_WASM_KEY unset → wrote ephemeral dev key to .tool-wasm-key.dev (gitignored).');
  return dev;
}

async function main() {
  const master = await resolveMaster();
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  for (const [id, entry] of Object.entries(WORKERS)) {
    const res = await build({
      entryPoints: [path.join(ROOT, entry)],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
      define: {
        'process.env.NODE_ENV': '"production"',
        // lib/brand reads these; `process` is undefined in a worker, so inline the
        // values at bundle time (unset → "Xonvert"; the oioxo build sets them).
        'process.env.NEXT_PUBLIC_BRAND': JSON.stringify(process.env.NEXT_PUBLIC_BRAND || ''),
        'process.env.NEXT_PUBLIC_BRAND_DOMAIN': JSON.stringify(process.env.NEXT_PUBLIC_BRAND_DOMAIN || ''),
        // jsquash codecs do `new URL("x.wasm", import.meta.url)`; in a blob worker
        // import.meta.url is invalid. Point it at a runtime global the loader sets
        // to `{origin}/jsquash/` (protected-worker.ts banner) so the wasm + the MT
        // .worker.mjs resolve to the real same-origin files copied by copy-jsquash.
        'import.meta.url': 'globalThis.__XW_BASE__',
      },
      tsconfig: path.join(ROOT, 'tsconfig.json'), // resolves the @/* path alias
      // Emscripten glue (occt-import-js, assimpjs) statically references node
      // built-ins inside dead ENVIRONMENT_IS_NODE branches — unreached in a
      // worker, so leaving them external is safe and lets the bundle build.
      external: ['path', 'fs', 'crypto', 'url', 'module', 'worker_threads', 'os', 'util'],
      logLevel: 'silent',
    });
    const js = res.outputFiles[0].text;
    const enc = encrypt(Buffer.from(js, 'utf8'), assetKey(master, id));
    await writeFile(path.join(OUT, `${id}.worker.js.enc`), enc);
    manifest[id] = { file: `${id}.worker.js.enc`, bytes: enc.length, sha256: createHash('sha256').update(enc).digest('hex').slice(0, 16) };
    console.log(`[encrypt-workers] ${id}: ${(js.length / 1024).toFixed(0)}KB JS → ${(enc.length / 1024).toFixed(0)}KB enc`);
  }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ release: RELEASE, workers: manifest }, null, 2));
  console.log(`[encrypt-workers] release=${RELEASE}, ${Object.keys(WORKERS).length} workers → public/protected/`);
}

main().catch((e) => { console.error('[encrypt-workers] FAILED:', e.message || e); process.exit(1); });
