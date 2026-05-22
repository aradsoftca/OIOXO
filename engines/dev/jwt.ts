/**
 * JWT decoding (header + payload). No signature verification — that needs the
 * signing key. Use the dev-jwt-decode tool only to inspect contents.
 */

function base64UrlDecode(s: string): string {
  // Restore padding and convert URL-safe chars.
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  const binary = atob(padded);
  // Treat as UTF-8 bytes.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT (expected three dot-separated parts)');
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    throw new Error('JWT header is not valid JSON');
  }
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    throw new Error('JWT payload is not valid JSON');
  }
  return { header, payload, signature: parts[2] };
}
