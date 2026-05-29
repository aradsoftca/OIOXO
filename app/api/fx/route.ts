import { NextResponse } from 'next/server';
import { rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

// Self-hosted FX rates. Our server fetches the European Central Bank's free
// daily reference feed (no API key, no third-party SaaS) and caches it in
// memory. The browser does the actual conversion math.
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h

interface FxData { base: 'EUR'; date: string; rates: Record<string, number> }
let cache: { data: FxData; fetchedAt: number } | null = null;
// Single-flight: without this, N concurrent stale-cache requests each issue
// their own fetch to ECB — classic cache stampede that blows through ECB's
// rate limit and wastes outbound bandwidth.
let inflight: Promise<FxData> | null = null;

async function fetchRates(): Promise<FxData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let xml: string;
  try {
    const res = await fetch(ECB_URL, { signal: ctrl.signal, headers: { accept: 'application/xml' } });
    if (!res.ok) throw new Error(`ECB ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const date = xml.match(/time=['"]([\d-]+)['"]/)?.[1] ?? new Date().toISOString().slice(0, 10);
  const rates: Record<string, number> = { EUR: 1 };
  const re = /currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) rates[m[1]] = parseFloat(m[2]);

  if (Object.keys(rates).length < 5) throw new Error('Unexpected ECB response');
  const data: FxData = { base: 'EUR', date, rates };
  cache = { data, fetchedAt: Date.now() };
  return data;
}

async function loadRates(): Promise<FxData> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = fetchRates().finally(() => { inflight = null; });
  return inflight;
}

export async function GET(req: Request) {
  if (rateLimited(clientIp(req.headers), 120)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  try {
    const data = await loadRates();
    return NextResponse.json(data, { headers: { 'cache-control': 'public, max-age=3600' } });
  } catch {
    // Serve stale cache if the upstream feed is briefly unavailable.
    if (cache) return NextResponse.json({ ...cache.data, stale: true });
    return NextResponse.json({ error: 'Exchange rates are temporarily unavailable.' }, { status: 503 });
  }
}
