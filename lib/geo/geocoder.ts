/**
 * ON-DEVICE geocoder — name → coordinates entirely in the browser. Fetches the
 * compact world-cities gazetteer (/geo/cities.txt, ~810KB gzipped, 63k cities)
 * ONCE, caches it, and looks up locally. No server call, no third party — fully
 * private, like the rest of oioxo. Lazy: only loads when a map question is asked.
 * Doesn't touch the 90MB model budget (it's cached data, not the model).
 *
 * File format (one city per line): `name\tlat\tlon\tcountryCode`, deduped by
 * name keeping the highest-population match (so "Paris" → France, not Texas).
 */
import type { GeoPoint } from '../ai/geo';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let _index: Promise<Map<string, GeoPoint>> | null = null;

function loadIndex(): Promise<Map<string, GeoPoint>> {
  _index ??= (async () => {
    const m = new Map<string, GeoPoint>();
    try {
      const r = await fetch('/geo/cities.txt', { cache: 'force-cache' });
      if (!r.ok) return m;
      const text = await r.text();
      for (const line of text.split('\n')) {
        const tab = line.indexOf('\t');
        if (tab < 1) continue;
        const [name, lat, lon, cc] = line.split('\t');
        const la = +lat, lo = +lon;
        if (!name || Number.isNaN(la) || Number.isNaN(lo)) continue;
        m.set(norm(name), { lat: la, lon: lo, label: cc ? `${name}, ${cc}` : name });
      }
    } catch {
      /* offline / not served → empty index, caller falls back */
    }
    return m;
  })();
  return _index;
}

// A few famous names GeoNames files differently — kept tiny + unambiguous.
const ALIAS: Record<string, string> = {
  'nyc': 'new york city', 'new york': 'new york city',
  'bombay': 'mumbai', 'peking': 'beijing', 'saigon': 'ho chi minh city',
  'st petersburg': 'saint petersburg', 'washington dc': 'washington',
};

/** Resolve a place name to coordinates, fully on-device. Null if not found. */
export async function geocodeLocal(place: string): Promise<GeoPoint | null> {
  if (typeof window === 'undefined') return null; // browser-only (on-device)
  const idx = await loadIndex();
  if (!idx.size) return null;
  const k0 = norm(place);
  if (!k0) return null;
  const k = ALIAS[k0] ? norm(ALIAS[k0]) : k0;
  if (idx.has(k)) return idx.get(k)!;
  // Many GeoNames entries carry a "City" suffix ("New York City", "Panama City").
  if (idx.has(k + ' city')) return idx.get(k + ' city')!;
  // Loose fallback: query is the start of a known city name.
  for (const [key, v] of idx) if (key.startsWith(k + ' ') || k.startsWith(key + ' ')) return v;
  return null;
}
