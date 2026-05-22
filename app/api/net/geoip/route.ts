import { NextResponse } from 'next/server';
import net from 'net';
import dns from 'dns/promises';
import { validHost, isPublicIp, rateLimited, clientIp } from '@/lib/net-guard';
import { geoLookup, geoipReady } from '@/lib/geoip';

export const runtime = 'nodejs';

// POST { query } where query is an IP or a domain → geolocation from local
// MaxMind GeoLite2 databases. No third-party API. If query is omitted we
// geolocate the caller's own IP.
export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 60)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }

  if (!(await geoipReady())) {
    return NextResponse.json(
      { error: 'GeoIP database not installed. Add GeoLite2-City.mmdb to the server (see lib/geoip.ts).' },
      { status: 503 },
    );
  }

  let query = '';
  try {
    const b = await req.json();
    query = String(b.query || '').trim();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  // No query → look up the caller.
  if (!query) {
    const self = clientIp(req.headers);
    query = self === 'unknown' ? '' : self;
  }

  query = query.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!query) return NextResponse.json({ error: 'Could not determine an IP to look up.' }, { status: 400 });

  // Resolve a domain to an IP (public only).
  let ip = query;
  if (!net.isIP(query)) {
    if (!validHost(query)) return NextResponse.json({ error: 'Enter a valid IP or domain.' }, { status: 400 });
    try {
      const { address } = await dns.lookup(query);
      ip = address;
    } catch {
      return NextResponse.json({ error: 'Could not resolve that domain.' }, { status: 400 });
    }
  }

  if (!isPublicIp(ip)) {
    return NextResponse.json({ error: 'Private or reserved address — not geolocatable.' }, { status: 400 });
  }

  try {
    const result = await geoLookup(ip);
    // Reverse DNS (PTR) — resolved on our server, best-effort.
    let reverseDns: string | undefined;
    try {
      const names = await Promise.race([
        dns.reverse(ip),
        new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
      ]);
      reverseDns = names?.[0];
    } catch { /* no PTR record */ }
    return NextResponse.json({ ...result, reverseDns, resolvedFrom: query !== ip ? query : undefined });
  } catch {
    return NextResponse.json({ error: 'GeoIP lookup failed.' }, { status: 502 });
  }
}
