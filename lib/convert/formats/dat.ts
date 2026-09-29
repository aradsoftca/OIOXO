/**
 * ".dat" is not a format — any program writes anything into it. The honest
 * conversion is to SHOW it: as text when the bytes are text, otherwise as a
 * classic hex dump (offset · hex bytes · printable ASCII).
 */

/** Hex dump is capped so a large binary cannot produce a multi-hundred-MB string. */
export const HEX_LIMIT = 2 * 1024 * 1024;

/** Decode as text when the bytes are (almost entirely) printable UTF-8 / UTF-16 with BOM. */
export function decodeAsText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    else text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (!text.length) return '';
  let control = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c) || c === 0x7f) control++;
  }
  return control / text.length < 0.01 ? text.replace(/^﻿/, '') : null;
}

export function hexDump(bytes: Uint8Array, limit = HEX_LIMIT): string {
  const n = Math.min(bytes.length, limit);
  const lines: string[] = [];
  for (let o = 0; o < n; o += 16) {
    const row = bytes.subarray(o, Math.min(o + 16, n));
    let hex = '';
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (i === 8) hex += ' ';
      if (i < row.length) {
        hex += row[i].toString(16).padStart(2, '0') + ' ';
        ascii += row[i] >= 0x20 && row[i] < 0x7f ? String.fromCharCode(row[i]) : '.';
      } else hex += '   ';
    }
    lines.push(`${o.toString(16).padStart(8, '0')}  ${hex} |${ascii}|`);
  }
  if (bytes.length > n) lines.push(`… truncated: showing the first ${n.toLocaleString('en-US')} of ${bytes.length.toLocaleString('en-US')} bytes`);
  return lines.join('\n') + '\n';
}

/** Text if the file is text, else a hex dump with a one-line explanation. */
export function datToText(bytes: Uint8Array): { text: string; kind: 'text' | 'hex' } {
  const t = decodeAsText(bytes);
  if (t !== null) return { text: t, kind: 'text' };
  return {
    text: `# Binary data (${bytes.length.toLocaleString('en-US')} bytes) — not text, shown as a hex dump\n\n${hexDump(bytes)}`,
    kind: 'hex',
  };
}
