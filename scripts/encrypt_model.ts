/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Encrypt an on-device MAIN-AI model's weights so they can't run without us.
 *
 * Output format matches lib/oioxo/protected-model.ts: a raw blob
 *   [12-byte IV][AES-256-GCM ciphertext + 16-byte tag]
 * encrypted with the per-asset key deriveAssetKey(master, assetId, release) — the
 * SAME key /api/ai-key derives and hands back (wrapped) per session. So the
 * served .enc is inert without a live entitlement handshake.
 *
 * Run (PowerShell):  $env:OIOXO_AI_SECRET=<b64-32B>; npx tsx scripts/encrypt_model.ts <in.onnx> <out.enc> <assetId> [release]
 * Or generate a secret:  npx tsx scripts/encrypt_model.ts --genkey
 */
import fs from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { deriveAssetKey } from '../lib/oioxo/unlock';
import { keyFromB64, keyToB64, randomKey } from '../lib/oioxo/protect';

(globalThis as any).crypto ??= crypto; // unlock.ts/protect.ts use the global WebCrypto

async function main() {
  if (process.argv[2] === '--genkey') {
    console.log('OIOXO_AI_SECRET=' + keyToB64(randomKey()));
    return;
  }
  const [inPath, outPath, assetId, release = process.env.OIOXO_AI_RELEASE || 'v1'] = process.argv.slice(2);
  if (!inPath || !outPath || !assetId) { console.error('usage: encrypt_model.ts <in.onnx> <out.enc> <assetId> [release]'); process.exit(2); }
  const masterB64 = process.env.OIOXO_AI_SECRET;
  if (!masterB64) { console.error('set OIOXO_AI_SECRET (base64 32 bytes); make one with --genkey'); process.exit(2); }

  const plain = new Uint8Array(fs.readFileSync(inPath));
  const assetKey = await deriveAssetKey(keyFromB64(masterB64), assetId, release);
  const ck = await crypto.subtle.importKey('raw', assetKey as any, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as any }, ck, plain as any));
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0); blob.set(ct, iv.length);
  fs.writeFileSync(outPath, blob);

  // VERIFY round-trip (byte-exact) — the asset is unusable without the derived key.
  const back = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, ck, ct as any));
  const ok = back.length === plain.length && back.every((b, i) => b === plain[i]);
  // wrong key must FAIL (no fallback)
  let wrongFails = false;
  try {
    const wrong = await crypto.subtle.importKey('raw', randomKey() as any, { name: 'AES-GCM' }, false, ['decrypt']);
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, wrong, ct as any);
  } catch { wrongFails = true; }
  console.log(`encrypted ${plain.length}B → ${outPath} (${blob.length}B)  assetId=${assetId} release=${release}`);
  console.log(`round-trip byte-exact: ${ok ? 'OK' : 'FAIL'} · wrong-key rejected: ${wrongFails ? 'OK' : 'FAIL'}`);
  if (!ok || !wrongFails) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
