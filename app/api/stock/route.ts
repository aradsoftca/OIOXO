import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Stock-photo search proxy for the AI poster composer.
 *
 * The provider API key lives ONLY here (server-side) — calling the provider from
 * the browser would expose the key and let anyone burn the quota. The browser
 * loads the actual image straight from the provider's CDN (with CORS), so this
 * route only does the lightweight keyword search.
 *
 * Ready-to-plug: set PEXELS_API_KEY (or PIXABAY_API_KEY) in the server env to
 * activate. With no key it returns { configured: false } and the composer falls
 * back to its procedural gradient backgrounds.
 *
 * Protected by the middleware (origin-lock + rate-limit + Proof-of-Work).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PEXELS = process.env.PEXELS_API_KEY;
const PIXABAY = process.env.PIXABAY_API_KEY;

interface Photo { url: string; thumb: string; credit: string; link: string; provider: string }

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 80).trim();
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 });
  if (!PEXELS && !PIXABAY) return NextResponse.json({ configured: false, photos: [] });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let photos: Photo[] = [];
    if (PEXELS) {
      const r = await fetch(`https://api.pexels.com/v1/search?per_page=12&orientation=landscape&query=${encodeURIComponent(q)}`,
        { headers: { Authorization: PEXELS }, signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json() as { photos?: { src?: Record<string, string>; photographer?: string; url?: string }[] };
        photos = (d.photos || []).map((p) => ({
          url: p.src?.large2x || p.src?.large || p.src?.original || '',
          thumb: p.src?.medium || '', credit: p.photographer || '', link: p.url || '', provider: 'Pexels',
        })).filter((p) => p.url);
      }
    } else if (PIXABAY) {
      const r = await fetch(`https://pixabay.com/api/?key=${PIXABAY}&image_type=photo&safesearch=true&per_page=12&q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json() as { hits?: { largeImageURL?: string; webformatURL?: string; user?: string; pageURL?: string }[] };
        photos = (d.hits || []).map((p) => ({
          url: p.largeImageURL || p.webformatURL || '',
          thumb: p.webformatURL || '', credit: p.user || '', link: p.pageURL || '', provider: 'Pixabay',
        })).filter((p) => p.url);
      }
    }
    return NextResponse.json({ configured: true, photos }, { headers: { 'cache-control': 'private, max-age=600' } });
  } catch {
    return NextResponse.json({ configured: true, photos: [] }); // soft-fail → gradient fallback
  } finally {
    clearTimeout(timer);
  }
}
