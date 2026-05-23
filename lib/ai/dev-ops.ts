/**
 * Xonvert AI — inline developer & generator operations.
 *
 * The same idea as text-ops, for the dev toolbox: JSON/XML formatting, hashing,
 * slugifying, JWT decoding, and generators (UUID, password, lorem ipsum) are all
 * pure functions, so the AI should just run them in the chat instead of opening
 * a page. Two shapes: transforms that take input text, and generators that need
 * none ("give me a uuid"). Everything here is pure / DOM-free and Node-testable
 * (crypto comes from the platform SubtleCrypto, present in browsers and Node).
 */

import { hash } from '@/engines/dev/crypto';
import { decodeJwt } from '@/engines/dev/jwt';
import { formatXml } from '@/engines/dev/xml';
import { CHARACTER_FIRST, CHARACTER_LAST } from '@/engines/names';

export interface DevOp {
  verb: string;
  /** False for generators that produce output from nothing. */
  needsInput: boolean;
  run: (input: string, message: string) => string | Promise<string>;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function genUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function genPassword(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_';
  const rnd = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(len)) : null;
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(rnd ? rnd[i] : Math.floor(Math.random() * 0xffffffff)) % chars.length];
  return out;
}
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi'.split(' ');
function genLorem(words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(LOREM[i % LOREM.length]);
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
function hashAlgo(msg: string): 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' {
  if (/sha-?512/i.test(msg)) return 'SHA-512';
  if (/sha-?384/i.test(msg)) return 'SHA-384';
  if (/sha-?1\b/i.test(msg)) return 'SHA-1';
  return 'SHA-256';
}

export const DEV_OPS: Record<string, DevOp> = {
  'dev-json-format': { verb: 'format the JSON', needsInput: true, run: (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return `⚠ Invalid JSON: ${(e as Error).message}`; } } },
  'dev-json-minify': { verb: 'minify the JSON', needsInput: true, run: (s) => { try { return JSON.stringify(JSON.parse(s)); } catch (e) { return `⚠ Invalid JSON: ${(e as Error).message}`; } } },
  'dev-json-validate': { verb: 'validate the JSON', needsInput: true, run: (s) => { try { JSON.parse(s); return '✓ Valid JSON.'; } catch (e) { return `⚠ Invalid JSON: ${(e as Error).message}`; } } },
  'dev-xml-format': { verb: 'format the XML', needsInput: true, run: (s) => { try { return formatXml(s); } catch { return '⚠ Could not format that XML.'; } } },
  'dev-slug': { verb: 'slugify it', needsInput: true, run: (s) => slugify(s) || '(empty)' },
  'dev-jwt-decode': { verb: 'decode the JWT', needsInput: true, run: (s) => { try { const d = decodeJwt(s.trim()); return JSON.stringify({ header: d.header, payload: d.payload }, null, 2); } catch { return '⚠ That doesn’t look like a valid JWT.'; } } },
  'dev-hash': { verb: 'hash it', needsInput: true, run: async (s, msg) => { const a = hashAlgo(msg); return `${a}: ${await hash(s, a)}`; } },
  'dev-uuid': { verb: 'generate a UUID', needsInput: false, run: () => genUuid() },
  'dev-password': { verb: 'generate a password', needsInput: false, run: (_s, msg) => { const m = msg.match(/(\d{1,3})/); return genPassword(Math.min(128, Math.max(6, m ? +m[1] : 16))); } },
  'dev-lorem': { verb: 'generate lorem ipsum', needsInput: false, run: (_s, msg) => { const m = msg.match(/(\d{1,4})/); return genLorem(Math.min(500, Math.max(5, m ? +m[1] : 40))); } },
  'gen-random-data': { verb: 'generate sample data', needsInput: false, run: (_s, msg) => {
    const n = Math.min(25, Math.max(1, parseInt(msg.match(/(\d+)/)?.[1] ?? '5', 10)));
    const rpick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    const rows = Array.from({ length: n }, (_v, i) => {
      const f = rpick(CHARACTER_FIRST), l = rpick(CHARACTER_LAST);
      return { id: i + 1, name: `${f} ${l}`, email: `${f}.${l}`.toLowerCase() + '@example.com', age: 18 + Math.floor(Math.random() * 52) };
    });
    return JSON.stringify(rows, null, 2);
  } },
};

export function devOpFor(id: string): DevOp | undefined {
  return DEV_OPS[id];
}
