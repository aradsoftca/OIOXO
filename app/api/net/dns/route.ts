import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import { validHost, rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'SRV', 'PTR'] as const;
type RecordType = (typeof TYPES)[number];

interface Row { type: string; data: string; TTL: number }

// Resolve via the per-TYPE resolver so A/AAAA carry their real TTL (the generic
// dns.resolve() drops it). Other record types don't expose TTL through Node's
// API, so TTL stays 0 for those.
async function resolveType(name: string, type: RecordType): Promise<Row[]> {
  const row = (data: string, TTL = 0): Row => ({ type, data, TTL });
  switch (type) {
    case 'A':
      return (await dns.resolve4(name, { ttl: true })).map((r) => row(r.address, r.ttl));
    case 'AAAA':
      return (await dns.resolve6(name, { ttl: true })).map((r) => row(r.address, r.ttl));
    case 'CNAME':
      return (await dns.resolveCname(name)).map((r) => row(r));
    case 'NS':
      return (await dns.resolveNs(name)).map((r) => row(r));
    case 'PTR':
      return (await dns.resolvePtr(name)).map((r) => row(r));
    case 'MX':
      return (await dns.resolveMx(name)).map((r) => row(`${r.priority} ${r.exchange}`));
    case 'TXT':
      return (await dns.resolveTxt(name)).map((r) => row(r.join('')));
    case 'SRV':
      return (await dns.resolveSrv(name)).map((r) => row(`${r.priority} ${r.weight} ${r.port} ${r.name}`));
    case 'CAA':
      return (await dns.resolveCaa(name)).map((r) => {
        const [k, v] = Object.entries(r).find(([key]) => key !== 'critical') ?? ['', ''];
        return row(`${r.critical ?? 0} ${k} "${v}"`);
      });
    case 'SOA': {
      const s = await dns.resolveSoa(name);
      return [row(`${s.nsname} ${s.hostmaster} ${s.serial} ${s.refresh} ${s.retry} ${s.expire} ${s.minttl}`, s.minttl)];
    }
    default:
      return [];
  }
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 60)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let name = '';
  let type: RecordType = 'A';
  try {
    const b = await req.json();
    name = String(b.name || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (b.type && TYPES.includes(b.type)) type = b.type;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!validHost(name)) {
    return NextResponse.json({ error: 'Enter a valid domain name.' }, { status: 400 });
  }

  try {
    // Uses the resolver this server is configured with — point the box at a
    // local Unbound/CoreDNS for fully independent resolution.
    // Hard 8s ceiling: dns.resolve* doesn't honor an AbortSignal and the
    // system resolver's own timeout can be ~30s, so an unreachable upstream
    // would tie up the request handler past next.js' default deadline.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const answers = await Promise.race<Row[]>([
      resolveType(name, type),
      new Promise<Row[]>((_, rej) => {
        timer = setTimeout(() => rej(new Error('Lookup timed out.')), 8000);
      }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    return NextResponse.json({ name, type, answers });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return NextResponse.json({ name, type, answers: [] });
    }
    return NextResponse.json({ error: 'Lookup failed. Check the domain and try again.' }, { status: 502 });
  }
}
