/**
 * Encrypt an on-device model's weights for the "permission as a key" gate
 * (project_anti_copy), the model-sized sibling of lib/ai/wasm/encrypt.mjs.
 *
 * AES-256-GCM with OIOXO_CODE_KEY (32-byte base64). Output is a binary blob:
 *   [12-byte IV][ciphertext + 16-byte GCM tag]
 * which lib/oioxo/protected-model.ts fetches + decrypts in the browser using the
 * key from /api/code-key. Only the weights are encrypted; config/tokenizer stay
 * public. Usage:
 *   OIOXO_CODE_KEY=<base64-32> node scripts/encrypt_model.mjs <in.onnx> <out.onnx.enc>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: OIOXO_CODE_KEY=<b64> node scripts/encrypt_model.mjs <in.onnx> <out.onnx.enc>');
  process.exit(1);
}
const keyB64 = process.env.OIOXO_CODE_KEY;
if (!keyB64) { console.error('OIOXO_CODE_KEY not set'); process.exit(1); }

const keyBytes = Buffer.from(keyB64, 'base64');
if (keyBytes.length !== 32) { console.error(`OIOXO_CODE_KEY must be 32 bytes base64 (got ${keyBytes.length})`); process.exit(1); }

const plain = readFileSync(inPath);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ck, plain));

const out = Buffer.concat([Buffer.from(iv), Buffer.from(ct)]); // IV || ciphertext+tag
writeFileSync(outPath, out);
console.log(`encrypted ${plain.length} → ${out.length} bytes → ${outPath} (iv 12B + ct/tag)`);
