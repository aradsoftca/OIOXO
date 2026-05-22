/**
 * IPv4/IPv6 + CIDR math, user-agent + HTTP header parsing.
 * All client-side, no fetches.
 */

// ── IPv4 ───────────────────────────────────────────────────────────────────

export function ip4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function numberToIp4(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixFromMask(mask: string): number {
  const n = ip4ToNumber(mask);
  let count = 0;
  let foundZero = false;
  for (let i = 31; i >= 0; i--) {
    const bit = (n >>> i) & 1;
    if (bit === 1) {
      if (foundZero) throw new Error('Invalid subnet mask — bits not contiguous');
      count++;
    } else {
      foundZero = true;
    }
  }
  return count;
}

export interface Cidr {
  ip: string;
  prefix: number;
  network: string;
  broadcast: string;
  mask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  hostCount: number;
  usableHosts: number;
  classLetter: 'A' | 'B' | 'C' | 'D' | 'E' | '?';
  isPrivate: boolean;
  binary: string;
}

const PRIVATE_RANGES: Array<[number, number]> = [
  [ip4ToNumber('10.0.0.0'),   ip4ToNumber('10.255.255.255')],
  [ip4ToNumber('172.16.0.0'), ip4ToNumber('172.31.255.255')],
  [ip4ToNumber('192.168.0.0'), ip4ToNumber('192.168.255.255')],
  [ip4ToNumber('127.0.0.0'),  ip4ToNumber('127.255.255.255')],
  [ip4ToNumber('169.254.0.0'), ip4ToNumber('169.254.255.255')],
];

export function parseCidr(input: string): Cidr {
  const trimmed = input.trim();
  const [ipPart, prefixPart] = trimmed.split('/');
  const prefix = prefixPart ? parseInt(prefixPart, 10) : 32;
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) throw new Error('Invalid prefix length');
  const ipNum = ip4ToNumber(ipPart);
  const mask = maskFromPrefix(prefix);
  const network = ipNum & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostCount = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
  const usableHosts = prefix >= 31 ? hostCount : hostCount - 2;
  const ipClass =
    (ipNum >>> 24) < 128 ? 'A' :
    (ipNum >>> 24) < 192 ? 'B' :
    (ipNum >>> 24) < 224 ? 'C' :
    (ipNum >>> 24) < 240 ? 'D' : 'E';
  const isPrivate = PRIVATE_RANGES.some(([lo, hi]) => ipNum >= lo && ipNum <= hi);
  return {
    ip: ipPart,
    prefix,
    network:  numberToIp4(network),
    broadcast: numberToIp4(broadcast),
    mask:     numberToIp4(mask),
    wildcard: numberToIp4((~mask) >>> 0),
    firstHost: numberToIp4(prefix >= 31 ? network : network + 1),
    lastHost:  numberToIp4(prefix >= 31 ? broadcast : broadcast - 1),
    hostCount,
    usableHosts,
    classLetter: ipClass,
    isPrivate,
    binary: ipNum.toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1.'),
  };
}

// ── HTTP headers ───────────────────────────────────────────────────────────

export interface Header { name: string; value: string }

export function parseHeaders(raw: string): Header[] {
  const out: Header[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('HTTP/')) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    out.push({
      name:  line.slice(0, i).trim(),
      value: line.slice(i + 1).trim(),
    });
  }
  return out;
}

// ── User agent ─────────────────────────────────────────────────────────────

export interface UA {
  raw: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: 'mobile' | 'tablet' | 'desktop';
  engine: string;
  bot: boolean;
}

export function parseUserAgent(ua: string): UA {
  const lc = ua.toLowerCase();
  const bot = /(bot|spider|crawler|slurp|baidu|yandex|googlebot|bingbot|gptbot|claude)/i.test(ua);

  // Browser detection
  let browser = 'Unknown';
  let version = '';
  let engine = 'Unknown';

  if (/edg\//i.test(ua))             { browser = 'Edge';    version = /edg\/([\d.]+)/i.exec(ua)?.[1] ?? ''; engine = 'Blink'; }
  else if (/firefox\//i.test(ua))    { browser = 'Firefox'; version = /firefox\/([\d.]+)/i.exec(ua)?.[1] ?? ''; engine = 'Gecko'; }
  else if (/chrome\//i.test(ua))     { browser = 'Chrome';  version = /chrome\/([\d.]+)/i.exec(ua)?.[1] ?? ''; engine = 'Blink'; }
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) { browser = 'Safari';  version = /version\/([\d.]+)/i.exec(ua)?.[1] ?? ''; engine = 'WebKit'; }
  else if (/opera|opr\//i.test(ua))  { browser = 'Opera';   version = /(?:opera|opr)\/([\d.]+)/i.exec(ua)?.[1] ?? ''; engine = 'Blink'; }

  // OS detection
  let os = 'Unknown';
  let osVersion = '';
  if      (/windows nt/i.test(ua))  { os = 'Windows';   osVersion = /windows nt ([\d.]+)/i.exec(ua)?.[1] ?? ''; }
  else if (/mac os x/i.test(ua))    { os = 'macOS';     osVersion = (/mac os x ([\d_.]+)/i.exec(ua)?.[1] ?? '').replace(/_/g, '.'); }
  else if (/android/i.test(ua))     { os = 'Android';   osVersion = /android ([\d.]+)/i.exec(ua)?.[1] ?? ''; }
  else if (/iphone|ipad|ipod/i.test(ua)) { os = 'iOS';  osVersion = (/os ([\d_.]+) like mac/i.exec(ua)?.[1] ?? '').replace(/_/g, '.'); }
  else if (/linux/i.test(ua))       { os = 'Linux'; }

  // Device class
  const device: UA['device'] = /tablet|ipad/i.test(lc)
    ? 'tablet'
    : /mobile|iphone|android(?!.*tablet)/i.test(lc)
      ? 'mobile'
      : 'desktop';

  return { raw: ua, browser, browserVersion: version, os, osVersion, device, engine, bot };
}

// ── MAC addresses ──────────────────────────────────────────────────────────

const MAC_REGEX = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{12}$/i;

// Tiny consumer-grade OUI lookup. Trimmed list — covers very common vendors.
const OUI: Record<string, string> = {
  'AC:DE:48': 'Apple',
  'F0:18:98': 'Apple',
  '00:1A:11': 'Google',
  '94:DE:80': 'Google',
  '00:0C:29': 'VMware',
  '00:50:56': 'VMware',
  '00:16:3E': 'Xensource',
  '52:54:00': 'QEMU',
  '00:15:5D': 'Microsoft',
  '00:0D:3A': 'Microsoft',
  'B8:27:EB': 'Raspberry Pi',
  'DC:A6:32': 'Raspberry Pi',
  '00:14:22': 'Dell',
  '00:1E:33': 'Nokia',
  '00:23:6C': 'Cisco',
  '00:0A:95': 'Apple',
  '00:25:9C': 'Cisco-Linksys',
  '00:1B:21': 'Intel',
  'A4:5E:60': 'Apple',
  '40:B0:34': 'Hewlett Packard',
  '00:08:74': 'Dell',
  '00:21:5C': 'Intel',
  'F4:5C:89': 'Apple',
  'DC:2B:2A': 'Apple',
};

export interface MacInfo {
  formatted: string;
  oui: string;
  vendor: string;
  unicast: boolean;
  universal: boolean;
}

export function parseMac(input: string): MacInfo {
  const clean = input.trim().toLowerCase();
  if (!MAC_REGEX.test(clean)) throw new Error('Invalid MAC address format');
  const hex = clean.replace(/[:-]/g, '');
  const formatted = hex.match(/.{2}/g)!.join(':').toUpperCase();
  const ouiKey = formatted.slice(0, 8);
  const firstByte = parseInt(hex.slice(0, 2), 16);
  return {
    formatted,
    oui: ouiKey,
    vendor: OUI[ouiKey] ?? '— vendor unknown —',
    unicast:  (firstByte & 0x01) === 0,
    universal: (firstByte & 0x02) === 0,
  };
}
