/**
 * Xonvert AI — inline color operations.
 *
 * Pure color math from engines/color, run in the chat: convert a colour between
 * HEX/RGB/HSL/HSV, and check the WCAG contrast ratio between two colours. The
 * "smart" part is finding the colour(s) in the message — hex (#f00, #ff0000),
 * rgb()/rgba(), or common colour names. Pure / DOM-free, fully Node-testable.
 */

import { parseHex, toHex, rgbToHsl, rgbToHsv, contrast, type RGB } from '@/engines/color';

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00',
  blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', orange: '#ffa500',
  purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', brown: '#a52a2a',
  teal: '#008080', navy: '#000080', gold: '#ffd700', silver: '#c0c0c0', indigo: '#4b0082',
};

/** Every colour mentioned in the message, in order (hex, rgb(), or named). */
export function findColors(msg: string): RGB[] {
  const out: RGB[] = [];
  const seen = new Set<string>();
  const add = (c: RGB | null) => { if (!c) return; const k = toHex(c); if (!seen.has(k)) { seen.add(k); out.push(c); } };
  // Walk the message left-to-right so order is preserved across token types.
  const re = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}|\b[a-z]{3,9}\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg)) !== null) {
    const tok = m[0];
    if (tok.startsWith('#')) add(parseHex(tok));
    else if (/^rgba?\(/i.test(tok)) { const n = tok.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/); if (n) add({ r: +n[1], g: +n[2], b: +n[3] }); }
    else { const hex = NAMED[tok.toLowerCase()]; if (hex) add(parseHex(hex)); }
  }
  return out;
}

function fmtColor(c: RGB): string {
  const hsl = rgbToHsl(c), hsv = rgbToHsv(c);
  return `${toHex(c)}  ·  RGB(${c.r}, ${c.g}, ${c.b})  ·  HSL(${hsl.h}, ${hsl.s}%, ${hsl.l}%)  ·  HSV(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
}

export interface ColorOp {
  verb: string;
  /** Returns the answer text, or null if the message has no usable colour(s). */
  run: (message: string) => string | null;
}

export const COLOR_OPS: Record<string, ColorOp> = {
  'gen-color-converter': {
    verb: 'convert the colour',
    run: (msg) => { const cs = findColors(msg); return cs.length ? fmtColor(cs[0]) : null; },
  },
  'gen-color-contrast': {
    verb: 'check the contrast',
    run: (msg) => {
      const cs = findColors(msg);
      if (cs.length < 2) return null;
      const ratio = contrast(cs[0], cs[1]);
      const grade = ratio >= 7 ? 'passes AAA' : ratio >= 4.5 ? 'passes AA' : ratio >= 3 ? 'AA for large text only' : 'fails WCAG';
      return `Contrast ${ratio.toFixed(2)}:1 between ${toHex(cs[0])} and ${toHex(cs[1])} — ${grade}.`;
    },
  },
};

export function colorOpFor(id: string): ColorOp | undefined {
  return COLOR_OPS[id];
}
