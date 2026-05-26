/**
 * oioxo — tiny base64url codec shared by the compute-mesh pairing payloads and device
 * keys. URL/QR-safe (no +/=). Works in the browser and Node (uses btoa/atob, present in
 * both). Kept dependency-free and pure.
 */

/** Raw bytes → base64url (no padding). */
export function toB64Url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → bytes. */
export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** UTF-8 string → base64url. */
export function utf8ToB64Url(s: string): string {
  return toB64Url(new TextEncoder().encode(s));
}

/** base64url → UTF-8 string. */
export function b64UrlToUtf8(s: string): string {
  return new TextDecoder().decode(fromB64Url(s));
}
