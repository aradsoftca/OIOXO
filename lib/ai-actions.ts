/**
 * Xonvert AI — agent action layer.
 *
 * Bridges natural language ("convert mp3 to wav") to the real, headless
 * conversion engines under engines/. The on-device language model is NOT
 * trusted to do the work; a deterministic planner resolves the request and the
 * engines do it for real.
 *
 * The planner is intentionally honest: it validates the requested target
 * format, checks it against the input file's category, and refuses (with a
 * useful message) rather than silently doing the wrong thing.
 */

import { powFetch } from '@/lib/pow-client';

export type MediaCategory = 'image' | 'audio' | 'video' | 'other';

export type ActionResult =
  | { kind: 'file'; blob: Blob; filename: string; note?: string }
  | { kind: 'image'; url: string; filename?: string; note?: string; blob?: Blob }
  | { kind: 'text'; text: string }
  | { kind: 'error'; text: string };

// --- format knowledge ------------------------------------------------------

/** Every format token we recognise, mapped to its media category. */
const KNOWN_FORMATS: Record<string, 'image' | 'audio'> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image',
  gif: 'image', bmp: 'image', svg: 'image', tif: 'image', tiff: 'image', heic: 'image',
  wav: 'audio', mp3: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', opus: 'audio',
};

/** Formats we can actually produce, per category. */
export const SUPPORTED_TARGETS: Record<'image' | 'audio', string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'avif'],
  audio: ['wav', 'mp3'],
};

const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus', 'wma', 'aiff']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'heif']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'flv', 'wmv']);

/** Best-effort category of an attached file, from MIME type then extension. */
export function fileCategory(file: File): MediaCategory {
  const t = file.type.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'other';
}

/** Pull a requested target format out of the message, if any. */
function detectTarget(lc: string): string | null {
  // Prefer an explicit "to X" / "as X" / "into X" / "-> X".
  const explicit = lc.match(/(?:to|as|into|->|→)\s*\.?\s*([a-z0-9]{2,4})/);
  if (explicit && KNOWN_FORMATS[explicit[1]]) return explicit[1];
  // Otherwise any bare mention of a known format.
  for (const f of Object.keys(KNOWN_FORMATS)) if (new RegExp(`\\b${f}\\b`).test(lc)) return f;
  return null;
}

// --- the planner -----------------------------------------------------------

export type ConvertPlan =
  /** Ready to run: we have a file and a valid, supported target. */
  | { kind: 'run'; category: 'image' | 'audio'; target: string }
  /** Valid request but no file yet — arm and ask for one. */
  | { kind: 'ask-file'; target: string | null }
  /** File present but no target named — ask which format. */
  | { kind: 'ask-format'; category: 'image' | 'audio'; supported: string[] }
  /** Target is a real format but we can't produce it (e.g. BMP). */
  | { kind: 'unsupported'; category: 'image' | 'audio'; target: string; supported: string[] }
  /** Input file is a kind we don't handle yet (e.g. video). */
  | { kind: 'unsupported-input'; fileCat: MediaCategory }
  /** Target format belongs to a different medium than the file (audio→image). */
  | { kind: 'mismatch'; target: string; targetCat: 'image' | 'audio'; fileCat: 'image' | 'audio' }
  /** Not a conversion request at all — caller should fall through. */
  | { kind: 'none' };

/**
 * Resolve a conversion request. `fileCat` is the category of the file in play
 * (freshly attached, or remembered from the last turn), or null if none.
 */
export function planConvert(text: string, fileCat: MediaCategory | null): ConvertPlan {
  const lc = text.toLowerCase();
  const target = detectTarget(lc);
  const strongVerb = /\b(convert|transcode|reencode|re-encode)\b/.test(lc);

  // Not a conversion request: no target named and no explicit convert verb.
  if (!target && !strongVerb) return { kind: 'none' };

  // We have a file but can't handle its medium yet (video, unknown).
  if (fileCat && fileCat !== 'image' && fileCat !== 'audio') {
    return { kind: 'unsupported-input', fileCat };
  }

  if (target) {
    const targetCat = KNOWN_FORMATS[target];
    // Asked for a format from a different medium than the file we have.
    if (fileCat && fileCat !== targetCat) {
      return { kind: 'mismatch', target, targetCat, fileCat };
    }
    // Real format, but not one we can output.
    if (!SUPPORTED_TARGETS[targetCat].includes(target)) {
      return { kind: 'unsupported', category: targetCat, target, supported: SUPPORTED_TARGETS[targetCat] };
    }
    if (!fileCat) return { kind: 'ask-file', target };
    return { kind: 'run', category: targetCat, target };
  }

  // Convert verb, but no target named.
  if (fileCat) return { kind: 'ask-format', category: fileCat, supported: SUPPORTED_TARGETS[fileCat] };
  return { kind: 'ask-file', target: null };
}

// --- the runner ------------------------------------------------------------

function baseName(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}

/** Actually perform a planned conversion via the engines. */
export async function runConvert(file: File, category: 'image' | 'audio', target: string): Promise<ActionResult> {
  if (category === 'audio') {
    const audio = await import('@/engines/audio');
    const ab = await audio.decode(await file.arrayBuffer());
    const blob = target === 'mp3' ? await audio.encodeMp3(ab) : audio.encodeWav(ab);
    return {
      kind: 'file',
      blob,
      filename: `${baseName(file)}.${target}`,
      note: `${ab.duration.toFixed(1)}s · ${ab.sampleRate} Hz · ${ab.numberOfChannels === 1 ? 'mono' : 'stereo'}`,
    };
  }
  // image
  const fmt = (target === 'jpg' ? 'jpeg' : target) as 'jpeg' | 'png' | 'webp' | 'avif';
  const img = await import('@/engines/image');
  const { data } = await img.decode(file);
  const { blob } = await img.encode(data, fmt, { quality: 90 });
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  return {
    kind: 'image',
    url: URL.createObjectURL(blob),
    filename: `${baseName(file)}.${ext}`,
    note: `${data.width}×${data.height}`,
    blob,
  };
}

// --- quick skills (no file, answered from our own server) ------------------

/**
 * Instant text skills that must NOT be left to the language model (which would
 * hallucinate). Each matches on the message and returns a real answer fetched
 * from our own backend. Append here to add more (DNS, headers, etc.).
 */
export interface QuickSkill {
  id: string;
  match: (lc: string) => boolean;
  run: (text: string) => Promise<ActionResult>;
}

/** First IP or domain found in the message, or null. */
function extractHost(text: string): string | null {
  const ip = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  if (ip) return ip[0];
  const dom = text.match(/\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})\b/i);
  return dom ? dom[1].toLowerCase() : null;
}
function extractUrl(text: string): string | null {
  const u = text.match(/https?:\/\/\S+/i);
  if (u) return u[0];
  const h = extractHost(text);
  return h ? `https://${h}` : null;
}
async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await powFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  return (await r.json()) as Record<string, unknown>;
}

const myIp: QuickSkill = {
  id: 'my-ip',
  // "my ip", "what's my ip" — but NOT "find ip of example.com" (that's geoip).
  match: (lc) => /\bip\b/.test(lc) && /\b(my|mine)\b/.test(lc),
  run: async () => {
    try {
      const r = await powFetch('/api/net/myip', { cache: 'no-store' });
      const d = (await r.json()) as { ip: string | null; family: string | null };
      if (!d.ip) return { kind: 'text', text: 'I couldn’t read your IP address — your network may be hiding it.' };
      return { kind: 'text', text: `Your public IP address is ${d.ip}${d.family ? ` (${d.family})` : ''}.` };
    } catch {
      return { kind: 'error', text: 'Couldn’t reach the network service to look up your IP.' };
    }
  },
};

const dnsLookup: QuickSkill = {
  id: 'dns',
  // Needs an actual domain to look up — so "what is dns" (a definition question)
  // falls through to a real answer instead of a "which domain?" dead-end.
  match: (lc) => /\.[a-z]{2,}/.test(lc) && (/\bdns\b/.test(lc) || /\b(mx|txt|cname|caa|srv|aaaa|ns)\s+record/.test(lc) || /\bname ?servers?\b/.test(lc) || /\bresolve\b/.test(lc)),
  run: async (text) => {
    const host = extractHost(text);
    if (!host) return { kind: 'text', text: 'Which domain? e.g. “DNS records for example.com”.' };
    const lc = text.toLowerCase();
    const type = (lc.match(/\b(aaaa|cname|caa|srv|mx|txt|ns)\b/)?.[1] ?? 'a').toUpperCase();
    try {
      const d = await postJson('/api/net/dns', { name: host, type });
      if (d.error) return { kind: 'text', text: String(d.error) };
      const answers = (d.answers as { value: string }[] | undefined) ?? [];
      if (!answers.length) return { kind: 'text', text: `No ${type} records for ${host}.` };
      return { kind: 'text', text: `${type} records for ${host}:\n${answers.map((a) => a.value).join('\n')}` };
    } catch { return { kind: 'error', text: 'DNS lookup failed.' }; }
  },
};

const geoIp: QuickSkill = {
  id: 'geoip',
  match: (lc) => (/\b(geoip|geolocat|locate|where ?is|location of)\b/.test(lc) && (/\bip\b/.test(lc) || /\d{1,3}\.\d{1,3}/.test(lc) || /\.[a-z]{2,}/.test(lc))) || /\bip lookup\b/.test(lc) || (/\bip\b/.test(lc) && /\b(of|for)\b/.test(lc) && /\.[a-z]{2,}|\d{1,3}\.\d{1,3}/.test(lc)),
  run: async (text) => {
    const host = extractHost(text);
    try {
      const d = await postJson('/api/net/geoip', { query: host ?? '' });
      if (d.error) return { kind: 'text', text: String(d.error) };
      const where = [d.city, d.region, d.country].filter(Boolean).join(', ');
      const parts: string[] = [];
      if (d.ip) parts.push(`IP ${d.ip}`);
      if (where) parts.push(where);
      if (d.org) parts.push(String(d.org));
      if (typeof d.latitude === 'number' && typeof d.longitude === 'number') parts.push(`(${d.latitude.toFixed(2)}, ${d.longitude.toFixed(2)})`);
      return { kind: 'text', text: parts.length ? parts.join(' · ') : 'No location data found for that address.' };
    } catch { return { kind: 'error', text: 'GeoIP lookup failed.' }; }
  },
};

const httpHeaders: QuickSkill = {
  id: 'http-headers',
  match: (lc) => /\bhttp headers?\b|\bresponse headers?\b/.test(lc) || (/\bheaders?\b/.test(lc) && /\.[a-z]{2,}|https?:\/\//.test(lc)),
  run: async (text) => {
    const url = extractUrl(text);
    if (!url) return { kind: 'text', text: 'Which URL? e.g. “headers for example.com”.' };
    try {
      const d = await postJson('/api/net/headers', { url });
      if (d.error) return { kind: 'text', text: String(d.error) };
      return { kind: 'text', text: `${d.url} → HTTP ${d.status}\n${d.text}` };
    } catch { return { kind: 'error', text: 'Header fetch failed.' }; }
  },
};

const sslCheck: QuickSkill = {
  id: 'ssl',
  // "check the SSL for example.com" — needs a domain so "what is ssl" stays a definition.
  match: (lc) => (/\bssl\b|\btls\b|\bcertificate\b|\bcert\b/.test(lc)) && /\.[a-z]{2,}/.test(lc),
  run: async (text) => {
    const host = extractHost(text);
    if (!host) return { kind: 'text', text: 'Which site? e.g. “check the SSL for example.com”.' };
    try {
      const d = await postJson('/api/net/ssl', { host });
      if (d.error) return { kind: 'text', text: String(d.error) };
      const parts = [`SSL for ${d.host}`];
      if (d.issuer) parts.push(`issued by ${d.issuer}`);
      if (typeof d.daysRemaining === 'number') parts.push(d.expired ? 'EXPIRED' : `valid for ${d.daysRemaining} more days`);
      if (d.validTo) parts.push(`until ${String(d.validTo)}`);
      return { kind: 'text', text: parts.join(' · ') };
    } catch { return { kind: 'error', text: 'SSL check failed.' }; }
  },
};

const whoisLookup: QuickSkill = {
  id: 'whois',
  match: (lc) => (/\bwhois\b|who owns|domain (?:info|owner|registr|age)/.test(lc)) && /\.[a-z]{2,}/.test(lc),
  run: async (text) => {
    const host = extractHost(text);
    if (!host) return { kind: 'text', text: 'Which domain? e.g. “whois example.com”.' };
    try {
      const d = await postJson('/api/net/whois', { domain: host });
      if (d.error) return { kind: 'text', text: String(d.error) };
      const parts = [`WHOIS ${d.domain}`];
      if (d.registrar) parts.push(`registrar: ${d.registrar}`);
      if (d.created) parts.push(`created: ${d.created}`);
      if (d.expires) parts.push(`expires: ${d.expires}`);
      return { kind: 'text', text: parts.length > 1 ? parts.join(' · ') : `WHOIS record for ${d.domain} retrieved.` };
    } catch { return { kind: 'error', text: 'WHOIS lookup failed.' }; }
  },
};

const pingHost: QuickSkill = {
  id: 'ping',
  match: (lc) => (/\bping\b|\breachable\b|\blatency\b|is .+ (?:up|down|online|reachable)/.test(lc)) && (/\.[a-z]{2,}/.test(lc) || /\d{1,3}\.\d{1,3}/.test(lc)),
  run: async (text) => {
    const host = extractHost(text);
    if (!host) return { kind: 'text', text: 'Which host? e.g. “ping example.com”.' };
    try {
      const d = await postJson('/api/net/ping', { host });
      if (d.error) return { kind: 'text', text: String(d.error) };
      if (d.avg == null) return { kind: 'text', text: `${d.host} didn’t respond (100% packet loss).` };
      return { kind: 'text', text: `${d.host} (${d.addr}) · avg ${d.avg} ms · min ${d.min} · max ${d.max} · ${d.loss}% loss` };
    } catch { return { kind: 'error', text: 'Ping failed.' }; }
  },
};

export const QUICK_SKILLS: QuickSkill[] = [myIp, dnsLookup, geoIp, httpHeaders, sslCheck, whoisLookup, pingHost];

/** First quick skill that matches the message, or null. */
export function resolveQuickSkill(text: string): QuickSkill | null {
  const lc = text.toLowerCase();
  for (const s of QUICK_SKILLS) if (s.match(lc)) return s;
  return null;
}
