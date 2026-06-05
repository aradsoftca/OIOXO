/**
 * X.509 / key certificate conversion (web-based, no library).
 *
 * PEM is just base64-wrapped DER inside "-----BEGIN …-----" armor. So PEM ↔ DER
 * is a pure base64 encode/decode — no crypto, no parsing required. Covers the
 * common cert/key extensions: pem, crt, cer, der, key.
 *
 *   .der/.cer (binary DER)  → .pem/.crt (text PEM)
 *   .pem/.crt (text PEM)    → .der/.cer (binary DER)
 */

const PEM_RE = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/;

function looksLikePem(bytes: Uint8Array): boolean {
  // Cheap sniff: a PEM file is ASCII text starting (after whitespace) with '----'.
  const head = new TextDecoder().decode(bytes.slice(0, 40));
  return head.trimStart().startsWith('-----BEGIN');
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Wrap raw DER bytes into a PEM block (64-char lines), guessing a sensible label. */
function derToPem(der: Uint8Array, label = 'CERTIFICATE'): string {
  const b64 = b64encode(der).replace(/(.{64})/g, '$1\n').trimEnd();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/** Extract the DER bytes from a PEM block. */
function pemToDer(pem: string): Uint8Array {
  const m = pem.match(PEM_RE);
  const b64 = m ? m[2] : pem; // tolerate bare base64 with no armor
  return b64decode(b64);
}

/** Pick a PEM label from the source extension (key files vs certs). */
function labelFor(ext: string): string {
  return ext === 'key' ? 'PRIVATE KEY' : 'CERTIFICATE';
}

export async function convertCert(file: File, to: string): Promise<{ blob: Blob; ext: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const srcExt = (file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || '';
  const isPem = looksLikePem(bytes);

  // Target is a text PEM (pem/crt/cer-as-text):
  if (to === 'pem' || to === 'crt') {
    const der = isPem ? pemToDer(new TextDecoder().decode(bytes)) : bytes;
    const pem = derToPem(der, labelFor(srcExt));
    return { blob: new Blob([pem], { type: 'application/x-pem-file' }), ext: to };
  }
  // Target is binary DER (der / cer):
  const der = isPem ? pemToDer(new TextDecoder().decode(bytes)) : bytes;
  return { blob: new Blob([new Uint8Array(der)], { type: 'application/pkix-cert' }), ext: to };
}
