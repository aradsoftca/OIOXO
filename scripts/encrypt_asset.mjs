/**
 * Encrypt a Pro asset (e.g. the quantized conductor weights) for hosting on the
 * CDN. The plaintext never ships; only AES-256-GCM ciphertext. The KEY is
 * OIOXO_PRO_KEY (server env + build env), handed to a valid Pro session by
 * /api/entitlement and used by lib/oioxo/pro-asset.ts to decrypt in memory.
 *
 *   node scripts/encrypt_asset.mjs <infile> <outfile.enc.json>
 *
 * Output is {iv, ct} base64 (ct includes the GCM tag — WebCrypto-compatible),
 * the same shape lib/oioxo/protect.ts EncBlob expects. Generates + prints
 * OIOXO_PRO_KEY if unset (capture it for the server, like the brain-key flow).
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node scripts/encrypt_asset.mjs <infile> <outfile.enc.json>');
  process.exit(1);
}

let keyB64 = process.env.OIOXO_PRO_KEY;
if (!keyB64) {
  keyB64 = randomBytes(32).toString('base64');
  console.log('OIOXO_PRO_KEY=' + keyB64); // capture for server env (rotated per release)
}
const key = Buffer.from(keyB64, 'base64');
if (key.length !== 32) { console.error('OIOXO_PRO_KEY must be base64 of 32 bytes'); process.exit(1); }

const data = readFileSync(inFile);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(data), cipher.final()]);
const tag = cipher.getAuthTag();
const enc = Buffer.concat([ct, tag]); // WebCrypto expects the tag appended

writeFileSync(outFile, JSON.stringify({ iv: iv.toString('base64'), ct: enc.toString('base64') }));
console.log(`Encrypted ${data.length}B → ${outFile} (${enc.length}B ciphertext).`);
