/**
 * Cheap, isomorphic fingerprint of a tool action's inputs — used to BIND a
 * permission ticket to the exact job it was issued for. A captured ticket
 * (toolKey=X, input=H) can only be spent on a job with the same input hash;
 * the same engine on a different file would generate a different fingerprint
 * and the verify would reject it.
 *
 * Uses WebCrypto SHA-256 (built in everywhere) on a stable serialisation of
 * the inputs. Takes only the first 16 hex chars so the ticket payload stays
 * small; collisions are negligibly rare at this length for legitimate use.
 */

const enc = new TextEncoder();

function bs(u: Uint8Array): BufferSource { return u as unknown as BufferSource; }

function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** Hash one or more strings + a fixed prefix to discourage cross-tool reuse. */
export async function hashStrings(toolKey: string, ...parts: string[]): Promise<string> {
  const body = `${toolKey}|${parts.join('|')}`;
  const h = await crypto.subtle.digest('SHA-256', bs(enc.encode(body)));
  return toHex(new Uint8Array(h)).slice(0, 16);
}

/** SHA-256 of a string → hex. Used by the text-input fingerprint so the
 *  binding actually depends on the content, not just length + prefix. */
async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bs(enc.encode(s)));
  return toHex(new Uint8Array(h));
}

/**
 * Build an input fingerprint for the most common tool shapes:
 *   { file: File }   — uses name + size + lastModified (cheap, no read)
 *   { text: string } — uses sha256 of the FULL text content
 *   { bytes: number, dims?: [w, h], duration?: number } — manual stats
 */
export async function hashInputFingerprint(
  toolKey: string,
  input: {
    file?: { name: string; size: number; lastModified?: number };
    text?: string;
    bytes?: number;
    dims?: [number, number];
    duration?: number;
    extra?: string;
  },
): Promise<string> {
  const parts: string[] = [];
  if (input.file) parts.push(`f:${input.file.name}:${input.file.size}:${input.file.lastModified ?? 0}`);
  if (input.text !== undefined) {
    // Hash the full text, not `length + first 64 chars` — the old form
    // collided whenever two different documents shared the same length and
    // first 64 chars (trivial to forge: take a copy and edit the middle).
    // A captured ticket then redirected to a forged input with the same
    // prefix would pass the per-input binding. SHA-256 of even a 10MB
    // string is milliseconds.
    parts.push(`t:${input.text.length}:${await sha256Hex(input.text)}`);
  }
  if (input.bytes !== undefined) parts.push(`b:${input.bytes}`);
  if (input.dims) parts.push(`d:${input.dims[0]}x${input.dims[1]}`);
  if (input.duration !== undefined) parts.push(`s:${input.duration.toFixed(2)}`);
  if (input.extra) parts.push(`x:${input.extra}`);
  return hashStrings(toolKey, ...parts);
}
