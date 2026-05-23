/**
 * Xonvert AI — inline text operations.
 *
 * ~30 of our text tools are pure string→string transforms. There's no reason to
 * send the user to a separate page for "uppercase this" or "extract the emails"
 * — the AI should just do it in the chat. This module makes the whole text
 * toolbox executable inline: a registry keyed by the same tool ids the router
 * already lands on, plus the "smart" bit — pulling the text to operate on (and
 * any parameters like a prefix or a find/replace pair) out of natural language.
 *
 * Pure / DOM-free, so it runs in the eval/verify harnesses too.
 */

import { toSentenceCase, toCamelCase, toPascalCase, toSnakeCase, toKebabCase, rot13, htmlEncode, htmlDecode, extract, readability } from '@/engines/text';

function b64encode(s: string): string {
  try { return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf-8').toString('base64'); }
  catch { return Buffer.from(s, 'utf-8').toString('base64'); }
}
function b64decode(s: string): string {
  try { return typeof atob === 'function' ? decodeURIComponent(escape(atob(s.trim()))) : Buffer.from(s.trim(), 'base64').toString('utf-8'); }
  catch { return Buffer.from(s.trim(), 'base64').toString('utf-8'); }
}
const lines = (s: string) => s.split(/\r?\n/);
const titleCase = (s: string) => s.replace(/\b([a-z])(\w*)/gi, (_m, a, b) => a.toUpperCase() + b.toLowerCase());
const joinList = (arr: string[], empty: string) => (arr.length ? arr.join('\n') : empty);

export interface TextOp {
  /** Present-tense phrase for the running line / confirmations. */
  verb: string;
  run: (input: string, message: string) => string;
}

/** Pull the value after a keyword: `prefix "x"`, `with: x`, `replace … with x`. */
function param(message: string, key: RegExp): string | null {
  const m = message.match(key);
  return m ? (m[1] ?? '').replace(/^["'“]|["'”]$/g, '') : null;
}

export const TEXT_OPS: Record<string, TextOp> = {
  'text-uppercase': { verb: 'make it UPPERCASE', run: (s) => s.toUpperCase() },
  'text-lowercase': { verb: 'make it lowercase', run: (s) => s.toLowerCase() },
  'text-title-case': { verb: 'Title-Case it', run: (s) => titleCase(s) },
  'text-sentence-case': { verb: 'sentence-case it', run: (s) => toSentenceCase(s) },
  'text-camel-case': { verb: 'camelCase it', run: (s) => toCamelCase(s) },
  'text-pascal-case': { verb: 'PascalCase it', run: (s) => toPascalCase(s) },
  'text-snake-case': { verb: 'snake_case it', run: (s) => toSnakeCase(s) },
  'text-kebab-case': { verb: 'kebab-case it', run: (s) => toKebabCase(s) },
  'text-rot13': { verb: 'ROT13 it', run: (s) => rot13(s) },
  'text-reverse': { verb: 'reverse the characters', run: (s) => [...s].reverse().join('') },
  'text-reverse-lines': { verb: 'reverse the line order', run: (s) => lines(s).reverse().join('\n') },
  'text-sort-lines': { verb: 'sort the lines', run: (s) => lines(s).sort((a, b) => a.localeCompare(b)).join('\n') },
  'text-remove-duplicates': { verb: 'remove duplicate lines', run: (s) => [...new Set(lines(s))].join('\n') },
  'text-remove-empty-lines': { verb: 'remove empty lines', run: (s) => lines(s).filter((l) => l.trim()).join('\n') },
  'text-remove-extra-spaces': { verb: 'tidy the spacing', run: (s) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim() },
  'text-remove-letters': { verb: 'remove the letters', run: (s) => s.replace(/[a-z]/gi, '') },
  'text-remove-numbers': { verb: 'remove the numbers', run: (s) => s.replace(/[0-9]/g, '') },
  'text-add-line-numbers': { verb: 'number the lines', run: (s) => lines(s).map((l, i) => `${i + 1}. ${l}`).join('\n') },
  'text-url-encode': { verb: 'URL-encode it', run: (s) => encodeURIComponent(s) },
  'text-url-decode': { verb: 'URL-decode it', run: (s) => { try { return decodeURIComponent(s); } catch { return s; } } },
  'text-html-encode': { verb: 'HTML-encode it', run: (s) => htmlEncode(s) },
  'text-base64': {
    verb: 'Base64 it',
    run: (s, msg) => /\bdecode\b/i.test(msg) ? b64decode(s) : b64encode(s),
  },
  'text-add-prefix': {
    verb: 'add a prefix',
    run: (s, msg) => { const p = param(msg, /(?:prefix|start(?:ing)? with|begin with)\s*:?\s*["'“]?([^"'”\n]+)/i) ?? ''; return lines(s).map((l) => p + l).join('\n'); },
  },
  'text-add-suffix': {
    verb: 'add a suffix',
    run: (s, msg) => { const p = param(msg, /(?:suffix|end(?:ing)? with|append)\s*:?\s*["'“]?([^"'”\n]+)/i) ?? ''; return lines(s).map((l) => l + p).join('\n'); },
  },
  'text-find-replace': {
    verb: 'find & replace',
    run: (s, msg) => {
      const m = msg.match(/replace\s+["'“]?(.+?)["'”]?\s+(?:with|to|by)\s+["'“]?(.+?)["'”]?\s*$/i);
      if (!m) return s;
      return s.split(m[1]).join(m[2]);
    },
  },
  'text-extract-emails': { verb: 'pull out the emails', run: (s) => joinList(extract(s, 'email'), 'No email addresses found.') },
  'text-extract-urls': { verb: 'pull out the links', run: (s) => joinList(extract(s, 'url'), 'No links found.') },
  'text-extract-numbers': { verb: 'pull out the numbers', run: (s) => joinList(extract(s, 'number'), 'No numbers found.') },
  'text-extract-phone': { verb: 'pull out the phone numbers', run: (s) => joinList(extract(s, 'phone'), 'No phone numbers found.') },
  'text-extract-hashtags': { verb: 'pull out the hashtags', run: (s) => joinList(extract(s, 'hashtag'), 'No hashtags found.') },
  'text-extract-mentions': { verb: 'pull out the mentions', run: (s) => joinList(extract(s, 'mention'), 'No mentions found.') },
  'text-word-counter': {
    verb: 'count it',
    run: (s) => {
      const words = (s.match(/\b[\w']+\b/g) ?? []).length;
      const chars = s.length;
      const ln = lines(s).length;
      const sentences = (s.match(/[.!?]+/g) ?? []).length;
      return `${words} words · ${chars} characters · ${ln} lines · ${sentences} sentences`;
    },
  },
  'text-readability': {
    verb: 'check the readability',
    run: (s) => { const r = readability(s); return `Readability ${r.score} — ${r.grade}.`; },
  },
};

export function textOpFor(toolId: string): TextOp | undefined {
  return TEXT_OPS[toolId];
}

/**
 * Find the text the user wants operated on, in priority order: after a colon
 * ("uppercase this: hello"), inside quotes, the block after the first line, or
 * a long trailing run of words. Returns null when there's nothing to work on
 * (the caller then asks the user to paste the text).
 */
export function extractOperand(message: string): string | null {
  const colon = message.match(/[:：]\s*([\s\S]+)$/);
  if (colon && colon[1].trim().length) return colon[1].trim();
  const quoted = message.match(/["“']([\s\S]{2,}?)["”']/);
  if (quoted && quoted[1].trim().length > 1) return quoted[1].trim();
  const nl = message.indexOf('\n');
  if (nl >= 0) { const rest = message.slice(nl + 1).trim(); if (rest.length) return rest; }
  return null;
}
