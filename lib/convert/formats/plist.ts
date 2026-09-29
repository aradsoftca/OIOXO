/**
 * Apple property lists — XML ("<plist>") and binary ("bplist00") — parsed to a
 * value tree, then written as JSON, indented text, or an XML plist. Pure, no DOM
 * (XML is tokenized by hand so it also runs in workers and tests).
 */

export type PlistValue =
  | null | boolean | number | string | Date | Uint8Array
  | PlistValue[] | { [key: string]: PlistValue };

const isDict = (v: PlistValue): v is { [key: string]: PlistValue } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array);

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- XML ------------------------------------------------------------------

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescapeXml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);

type Tok = { kind: 'open' | 'close' | 'empty'; name: string } | { kind: 'text'; text: string };

function tokenize(xml: string): Tok[] {
  const toks: Tok[] = [];
  const body = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const re = /<(\/?)([A-Za-z][\w.-]*)[^>]*?(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[4] !== undefined) toks.push({ kind: 'text', text: m[4] });
    else toks.push({ kind: m[1] ? 'close' : m[3] ? 'empty' : 'open', name: m[2] });
  }
  return toks;
}

export function parseXmlPlist(xml: string): PlistValue {
  const toks = tokenize(xml);
  let i = 0;
  const skipWs = (): void => { while (i < toks.length && toks[i].kind === 'text' && !(toks[i] as { text: string }).text.trim()) i++; };
  const textUntil = (name: string): string => {
    let s = '';
    while (i < toks.length) {
      const t = toks[i++];
      if (t.kind === 'text') s += t.text;
      else if (t.kind === 'close' && t.name === name) return unescapeXml(s);
      else throw new Error(`Unexpected <${t.name}> inside <${name}>.`);
    }
    throw new Error(`Unclosed <${name}>.`);
  };
  const value = (): PlistValue => {
    skipWs();
    const t = toks[i++];
    if (!t || t.kind === 'text' || t.kind === 'close') throw new Error('Malformed plist XML.');
    const empty = t.kind === 'empty';
    switch (t.name) {
      case 'true': if (!empty) textUntil('true'); return true;
      case 'false': if (!empty) textUntil('false'); return false;
      case 'string': return empty ? '' : textUntil('string');
      case 'integer': { const s = empty ? '0' : textUntil('integer').trim(); const n = Number(s); return Number.isSafeInteger(n) ? n : s; }
      case 'real': return empty ? 0 : Number(textUntil('real').trim());
      case 'date': return new Date(empty ? 0 : textUntil('date').trim());
      case 'data': return empty ? new Uint8Array(0) : unb64(textUntil('data'));
      case 'array': {
        const arr: PlistValue[] = [];
        if (empty) return arr;
        for (;;) {
          skipWs();
          const n = toks[i];
          if (n && n.kind === 'close' && n.name === 'array') { i++; return arr; }
          arr.push(value());
        }
      }
      case 'dict': {
        const obj: { [key: string]: PlistValue } = {};
        if (empty) return obj;
        for (;;) {
          skipWs();
          const n = toks[i++];
          if (!n) throw new Error('Unclosed <dict>.');
          if (n.kind === 'close' && n.name === 'dict') return obj;
          if (n.kind !== 'open' || n.name !== 'key') throw new Error('Expected <key> in <dict>.');
          const k = textUntil('key');
          obj[k] = value();
        }
      }
      default: throw new Error(`Unknown plist element <${t.name}>.`);
    }
  };
  skipWs();
  const first = toks[i];
  if (first && first.kind === 'open' && first.name === 'plist') { i++; }
  else if (first && first.kind === 'empty' && first.name === 'plist') return null;
  return value();
}

// --- Binary (bplist00) ----------------------------------------------------

export function parseBinaryPlist(bytes: Uint8Array): PlistValue {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 40) throw new Error('Binary plist is too short.');
  const t = bytes.length - 32;
  const offSize = bytes[t + 6];
  const refSize = bytes[t + 7];
  const count = Number(dv.getBigUint64(t + 8));
  const top = Number(dv.getBigUint64(t + 16));
  const tableOff = Number(dv.getBigUint64(t + 24));
  const uint = (p: number, size: number): number => {
    let v = 0;
    for (let k = 0; k < size; k++) v = v * 256 + bytes[p + k];
    return v;
  };
  const offsets: number[] = [];
  for (let k = 0; k < count; k++) offsets.push(uint(tableOff + k * offSize, offSize));
  const utf16 = new TextDecoder('utf-16be');
  const ascii = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');

  const intObj = (p: number): { value: number | bigint; size: number } => {
    const n = 1 << (bytes[p] & 0xf);
    if (n === 8) { const v = dv.getBigInt64(p + 1); return { value: v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v, size: 1 + n }; }
    if (n === 16) { const v = (dv.getBigUint64(p + 1) << BigInt(64)) | dv.getBigUint64(p + 9); return { value: v, size: 1 + n }; }
    return { value: uint(p + 1, n), size: 1 + n };
  };
  const lengthAt = (p: number): { len: number; start: number } => {
    const low = bytes[p] & 0xf;
    if (low !== 0xf) return { len: low, start: p + 1 };
    const { value, size } = intObj(p + 1);
    return { len: Number(value), start: p + 1 + size };
  };

  const seen = new Set<number>();
  const obj = (ref: number): PlistValue => {
    if (ref >= offsets.length) throw new Error('Broken binary plist (object reference out of range).');
    if (seen.has(ref)) throw new Error('Binary plist contains a reference cycle.');
    seen.add(ref);
    try {
      const p = offsets[ref];
      const m = bytes[p];
      switch (m >> 4) {
        case 0x0: return m === 0x08 ? false : m === 0x09 ? true : null;
        case 0x1: { const v = intObj(p).value; return typeof v === 'bigint' ? v.toString() : v; }
        case 0x2: return (m & 0xf) === 2 ? dv.getFloat32(p + 1) : dv.getFloat64(p + 1);
        case 0x3: return new Date(Date.UTC(2001, 0, 1) + dv.getFloat64(p + 1) * 1000);
        case 0x4: { const { len, start } = lengthAt(p); return bytes.slice(start, start + len); }
        case 0x5: { const { len, start } = lengthAt(p); return ascii.decode(bytes.subarray(start, start + len)); }
        case 0x6: { const { len, start } = lengthAt(p); return utf16.decode(bytes.subarray(start, start + len * 2)); }
        case 0x7: { const { len, start } = lengthAt(p); return utf8.decode(bytes.subarray(start, start + len)); }
        case 0x8: return { 'CF$UID': uint(p + 1, (m & 0xf) + 1) };
        case 0xa: case 0xc: {
          const { len, start } = lengthAt(p);
          return Array.from({ length: len }, (_, k) => obj(uint(start + k * refSize, refSize)));
        }
        case 0xd: {
          const { len, start } = lengthAt(p);
          const out: { [key: string]: PlistValue } = {};
          for (let k = 0; k < len; k++) {
            const key = obj(uint(start + k * refSize, refSize));
            out[String(key)] = obj(uint(start + (len + k) * refSize, refSize));
          }
          return out;
        }
        default: throw new Error(`Unknown binary plist object type 0x${m.toString(16)}.`);
      }
    } finally {
      seen.delete(ref);
    }
  };
  return obj(top);
}

export function parsePlist(bytes: Uint8Array): PlistValue {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (head === 'bplist00') return parseBinaryPlist(bytes);
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  if (/<plist[\s>]/.test(text) || /^\s*<\?xml/.test(text)) return parseXmlPlist(text);
  if (/^\s*[{(]/.test(text)) throw new Error('This is an old-style (OpenStep) text plist, which is not supported. XML and binary plists are.');
  throw new Error('Not a property list (expected XML <plist> or binary bplist00).');
}

// --- Writers --------------------------------------------------------------

const toJsonable = (v: PlistValue): unknown => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof Uint8Array) return b64(v);
  if (Array.isArray(v)) return v.map(toJsonable);
  if (isDict(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonable(x)]));
  return v;
};

/** JSON: dates as ISO-8601 strings, binary data as Base64 strings. */
export function plistToJson(v: PlistValue): string {
  return JSON.stringify(toJsonable(v), null, 2) + '\n';
}

/** Human-readable indented outline. */
export function plistToText(v: PlistValue, indent = ''): string {
  const scalar = (x: PlistValue): string => {
    if (x === null) return '(null)';
    if (x instanceof Date) return Number.isNaN(x.getTime()) ? '(invalid date)' : x.toISOString();
    if (x instanceof Uint8Array) return `<${x.length} bytes of data>`;
    return String(x);
  };
  const lines: string[] = [];
  const walk = (x: PlistValue, pad: string): void => {
    if (Array.isArray(x)) {
      x.forEach((item, i) => {
        if (Array.isArray(item) || isDict(item)) { lines.push(`${pad}[${i}]`); walk(item, pad + '  '); }
        else lines.push(`${pad}[${i}] ${scalar(item)}`);
      });
    } else if (isDict(x)) {
      for (const [k, item] of Object.entries(x)) {
        if (Array.isArray(item) || isDict(item)) { lines.push(`${pad}${k}:`); walk(item, pad + '  '); }
        else lines.push(`${pad}${k}: ${scalar(item)}`);
      }
    } else lines.push(pad + scalar(x));
  };
  walk(v, indent);
  return lines.join('\n') + '\n';
}

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** XML plist (the format Xcode and `plutil -convert xml1` write). */
export function plistToXml(v: PlistValue): string {
  const out: string[] = [];
  const w = (x: PlistValue, pad: string): void => {
    if (x === null) out.push(`${pad}<string></string>`);
    else if (x === true) out.push(`${pad}<true/>`);
    else if (x === false) out.push(`${pad}<false/>`);
    else if (typeof x === 'number') out.push(Number.isInteger(x) ? `${pad}<integer>${x}</integer>` : `${pad}<real>${x}</real>`);
    else if (typeof x === 'string') out.push(`${pad}<string>${escapeXml(x)}</string>`);
    else if (x instanceof Date) out.push(`${pad}<date>${x.toISOString().replace(/\.\d{3}Z$/, 'Z')}</date>`);
    else if (x instanceof Uint8Array) out.push(`${pad}<data>${b64(x)}</data>`);
    else if (Array.isArray(x)) {
      if (!x.length) { out.push(`${pad}<array/>`); return; }
      out.push(`${pad}<array>`); x.forEach((i) => w(i, pad + '\t')); out.push(`${pad}</array>`);
    } else {
      const e = Object.entries(x);
      if (!e.length) { out.push(`${pad}<dict/>`); return; }
      out.push(`${pad}<dict>`);
      for (const [k, i] of e) { out.push(`${pad}\t<key>${escapeXml(k)}</key>`); w(i, pad + '\t'); }
      out.push(`${pad}</dict>`);
    }
  };
  w(v, '');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n'
    + out.join('\n') + '\n</plist>\n';
}
