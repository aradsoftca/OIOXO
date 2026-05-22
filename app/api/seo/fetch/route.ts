import { NextResponse } from 'next/server';
import { rateLimited, clientIp } from '@/lib/net-guard';
import { guardedFetch } from '@/lib/server-fetch';

export const runtime = 'nodejs';

// POST { url } → the page's raw HTML, fetched by our server (CORS-free), so the
// existing client-side meta / Open Graph / Twitter-card parsers run unchanged.
// We trim to the <head> region to keep the payload small.
export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 40)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let url = '';
  try {
    url = String((await req.json()).url || '').trim();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: 'Enter a URL.' }, { status: 400 });

  try {
    const r = await guardedFetch(url, { method: 'GET', maxBytes: 1_500_000 });
    if (r.status >= 400) {
      return NextResponse.json({ error: `Site returned HTTP ${r.status}.` }, { status: 502 });
    }
    // Keep through </head> if present; otherwise cap to a sane size.
    const headEnd = r.body.search(/<\/head>/i);
    const text = headEnd > -1 ? r.body.slice(0, headEnd + 7) : r.body.slice(0, 100_000);
    return NextResponse.json({ url: r.finalUrl, text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
