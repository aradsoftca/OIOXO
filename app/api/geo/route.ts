import { NextResponse } from 'next/server';
import { lookupPlace } from '@/lib/geo/gazetteer';

// Geocode a place name → coordinates, from our LOCAL gazetteer. No third-party
// API (same policy as /api/net/geoip's MaxMind database). Node runtime: it may
// read an optional data/cities.tsv extract.
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });
  const p = lookupPlace(q);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(
    { lat: p.lat, lon: p.lon, label: p.label },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
