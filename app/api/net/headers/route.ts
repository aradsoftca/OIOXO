import { NextResponse } from 'next/server';
import { rateLimited, clientIp } from '@/lib/net-guard';
import { guardedFetch } from '@/lib/server-fetch';

export const runtime = 'nodejs';

// POST { url } → the live HTTP response headers for that URL, fetched by our
// server (browsers can't read cross-origin headers). Returned as a raw block
// so the existing header parser/analyzer on the client works unchanged.
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
    const r = await guardedFetch(url, { method: 'GET', maxBytes: 1 });
    const lines = [
      `HTTP ${r.status} ${r.statusText}`.trim(),
      ...r.headers.map(([k, v]) => `${k}: ${v}`),
    ];
    return NextResponse.json({ url: r.finalUrl, status: r.status, text: lines.join('\n') });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
