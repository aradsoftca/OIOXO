/**
 * Tiny crypto helpers backed by the platform's SubtleCrypto.
 */

type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

function toBuffer(s: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(s);
  // Return a plain ArrayBuffer slice — keeps SubtleCrypto's type checker happy
  // across TS lib versions that disallow ArrayBufferLike unions.
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hash(text: string, algo: HashAlgo): Promise<string> {
  const buf = await crypto.subtle.digest(algo, toBuffer(text));
  return bytesToHex(buf);
}

export async function hmac(
  key: string,
  message: string,
  algo: HashAlgo = 'SHA-256',
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(key),
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', cryptoKey, toBuffer(message));
  return bytesToHex(buf);
}

/** Decode a base32-encoded string (RFC 4648) — TOTP seeds use this. */
export function base32Decode(input: string): ArrayBuffer {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let idx = 0;
  for (const ch of clean) {
    const i = alpha.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[idx++] = (value >>> bits) & 0xff;
    }
  }
  return out.buffer.slice(0, idx) as ArrayBuffer;
}

/**
 * RFC 6238 TOTP — Time-based one-time password. Generates a code for any
 * 30-second window from a base32 secret.
 */
export async function totp(
  secretBase32: string,
  opts: { period?: number; digits?: number; algo?: HashAlgo; nowMs?: number } = {},
): Promise<{ code: string; secondsRemaining: number }> {
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const algo = opts.algo ?? 'SHA-1';
  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const counter = Math.floor(now / period);

  const counterBuf = new ArrayBuffer(8);
  new DataView(counterBuf).setBigUint64(0, BigInt(counter));

  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secretBase32),
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );
  const hmacBuf = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = hmacBuf[hmacBuf.length - 1] & 0x0f;
  const bin =
    ((hmacBuf[offset]     & 0x7f) << 24) |
    ((hmacBuf[offset + 1] & 0xff) << 16) |
    ((hmacBuf[offset + 2] & 0xff) << 8)  |
     (hmacBuf[offset + 3] & 0xff);
  const code = String(bin % 10 ** digits).padStart(digits, '0');
  const secondsRemaining = period - (now % period);
  return { code, secondsRemaining };
}
