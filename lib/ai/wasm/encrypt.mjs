/**
 * Encrypt the WASM brain core for shipping. The plaintext .wasm never goes in
 * the bundle — only AES-256-GCM ciphertext. The KEY lives in BRAIN_WASM_KEY
 * (server env + build env), never in the client; the browser fetches it from
 * the auth/origin-gated /api/brain-key route, decrypts in memory, and caches it
 * for offline use. A copied client with no valid session can't get the key →
 * the brain is useless bytes.
 *
 * Run:  node lib/ai/wasm/encrypt.mjs   (after wasm-pack build --target web)
 * Generates BRAIN_WASM_KEY into .env.local if absent (print it; set on server).
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..'); // newxonvert/
const envLocal = join(repo, '.env.local');

// Resolve the key: env → .env.local → generate.
function readEnvLocalKey() {
  if (!existsSync(envLocal)) return null;
  const m = readFileSync(envLocal, 'utf8').match(/^BRAIN_WASM_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}
const ROTATE = process.argv.includes('--rotate') || process.env.ROTATE === '1';
let keyB64 = ROTATE ? null : (process.env.BRAIN_WASM_KEY || readEnvLocalKey());
if (!keyB64) {
  keyB64 = randomBytes(32).toString('base64');
  // Persist into .env.local (replace any existing line) for local dev parity.
  if (existsSync(envLocal)) {
    const cur = readFileSync(envLocal, 'utf8');
    const next = /^BRAIN_WASM_KEY=.*$/m.test(cur)
      ? cur.replace(/^BRAIN_WASM_KEY=.*$/m, `BRAIN_WASM_KEY=${keyB64}`)
      : cur.replace(/\n*$/, '') + `\nBRAIN_WASM_KEY=${keyB64}\n`;
    writeFileSync(envLocal, next);
  } else {
    appendFileSync(envLocal, `BRAIN_WASM_KEY=${keyB64}\n`);
  }
  // Machine-parseable line so deploy.py can capture the rotated key for the server.
  console.log('ROTATED_BRAIN_WASM_KEY=' + keyB64);
}
const key = Buffer.from(keyB64, 'base64');
if (key.length !== 32) { console.error('BRAIN_WASM_KEY must be base64 of 32 bytes'); process.exit(1); }

const wasm = readFileSync(join(here, 'pkg', 'brain_core_bg.wasm'));
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(wasm), cipher.final()]);
const tag = cipher.getAuthTag();
// WebCrypto AES-GCM expects ciphertext WITH the tag appended.
const enc = Buffer.concat([ct, tag]);

const out = `// AUTO-GENERATED — AES-256-GCM ciphertext of pkg/brain_core_bg.wasm.
// The key is NOT here; it comes from the server (/api/brain-key). Do not edit.
export const WASM_ENC = { enc: ${JSON.stringify(enc.toString('base64'))}, iv: ${JSON.stringify(iv.toString('base64'))} };
`;
writeFileSync(join(here, 'wasm-bytes.ts'), out);
console.log(`Encrypted ${wasm.length}B wasm → wasm-bytes.ts (${enc.length}B ciphertext).`);
