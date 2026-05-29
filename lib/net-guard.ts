/**
 * Safety guard for the server-side network diagnostics (SSL / ports / ping).
 *
 * These tools open outbound connections from OUR server, so they're abuse-prone.
 * We defend with:
 *   - strict host/port validation (no shell — pure Node net/tls only),
 *   - SSRF protection: resolve the host and REFUSE any private / loopback /
 *     link-local / CGNAT / multicast / cloud-metadata address,
 *   - a per-IP in-memory rate limit.
 */

import dns from 'dns/promises';
import net from 'net';

const HOST_RE = /^[a-zA-Z0-9._-]{1,253}$/;

export function validHost(h: string): boolean {
  if (!h) return false;
  if (net.isIP(h)) return true;
  return HOST_RE.test(h) && !h.includes('..');
}

function v4Private(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;            // this-net, private, loopback
  if (a === 169 && b === 254) return true;                       // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;              // private
  if (a === 192 && b === 168) return true;                       // private
  if (a === 100 && b >= 64 && b <= 127) return true;             // CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true;           // IETF
  if (a >= 224) return true;                                     // multicast + reserved
  return false;
}

function v6Private(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd')) return true;
  const m = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (m) return v4Private(m[1]);
  return false;
}

export function isPublicIp(ip: string): boolean {
  const f = net.isIP(ip);
  if (f === 4) return !v4Private(ip);
  if (f === 6) return !v6Private(ip);
  return false;
}

/** Resolve host → a single PUBLIC ip, throwing if it (or any record) is private. */
export async function resolvePublic(host: string): Promise<string> {
  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new Error('Address is private or reserved — not allowed.');
    return host;
  }
  let addrs: { address: string; family: number }[];
  // Race with a hard 5s timeout — dns.lookup doesn't honor AbortSignal and
  // the system resolver can hang ~30s on an unreachable upstream, tying up
  // every network-tool request past next.js' default deadline.
  let dnsTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    addrs = await Promise.race<{ address: string; family: number }[]>([
      dns.lookup(host, { all: true }),
      new Promise<{ address: string; family: number }[]>((_, rej) => {
        dnsTimer = setTimeout(() => rej(new Error('timeout')), 5000);
      }),
    ]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  } catch {
    throw new Error('Could not resolve host.');
  }
  if (!addrs.length) throw new Error('Could not resolve host.');
  for (const a of addrs) {
    if (!isPublicIp(a.address)) throw new Error('Host resolves to a private/internal address — blocked.');
  }
  return (addrs.find((a) => a.family === 4) ?? addrs[0]).address;
}

export function validPort(n: unknown): boolean {
  const p = Number(n);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

// ---- per-IP rate limit (in-memory; resets on deploy) ----
import { take as _take, type Bucket } from './rate-limit';
const hits = new Map<string, Bucket>();
export function rateLimited(ip: string, max = 30, windowMs = 5 * 60 * 1000): boolean {
  return !_take(hits, ip, { max, windowMs });
}

export function clientIp(h: Headers): string {
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}
