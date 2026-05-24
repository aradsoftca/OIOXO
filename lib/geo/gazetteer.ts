/**
 * Local place gazetteer — name → coordinates, on OUR server, no third party
 * (same ethos as the MaxMind GeoLite2 IP database). A built-in SEED of major
 * world places makes geocoding work out of the box; drop a full GeoNames extract
 * at `data/cities.tsv` (geonameid\tname\t…\tlat\tlon\t…\tcountry) for worldwide
 * city-level coverage — loaded once, cached. Street addresses need a self-hosted
 * Nominatim (Phase 2); this covers cities, capitals and countries.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Place { lat: number; lon: number; label: string }

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Compact seed: major global cities + capitals + a few countries. Enough for the
// common "distance between two places" / "where is X" questions immediately.
const SEED: Record<string, Place> = {
  'london': { lat: 51.5074, lon: -0.1278, label: 'London, UK' },
  'paris': { lat: 48.8566, lon: 2.3522, label: 'Paris, France' },
  'new york': { lat: 40.7128, lon: -74.006, label: 'New York, USA' },
  'nyc': { lat: 40.7128, lon: -74.006, label: 'New York, USA' },
  'los angeles': { lat: 34.0522, lon: -118.2437, label: 'Los Angeles, USA' },
  'chicago': { lat: 41.8781, lon: -87.6298, label: 'Chicago, USA' },
  'san francisco': { lat: 37.7749, lon: -122.4194, label: 'San Francisco, USA' },
  'washington': { lat: 38.9072, lon: -77.0369, label: 'Washington, D.C., USA' },
  'toronto': { lat: 43.6532, lon: -79.3832, label: 'Toronto, Canada' },
  'mexico city': { lat: 19.4326, lon: -99.1332, label: 'Mexico City, Mexico' },
  'tokyo': { lat: 35.6762, lon: 139.6503, label: 'Tokyo, Japan' },
  'osaka': { lat: 34.6937, lon: 135.5023, label: 'Osaka, Japan' },
  'beijing': { lat: 39.9042, lon: 116.4074, label: 'Beijing, China' },
  'shanghai': { lat: 31.2304, lon: 121.4737, label: 'Shanghai, China' },
  'hong kong': { lat: 22.3193, lon: 114.1694, label: 'Hong Kong' },
  'seoul': { lat: 37.5665, lon: 126.978, label: 'Seoul, South Korea' },
  'singapore': { lat: 1.3521, lon: 103.8198, label: 'Singapore' },
  'bangkok': { lat: 13.7563, lon: 100.5018, label: 'Bangkok, Thailand' },
  'mumbai': { lat: 19.076, lon: 72.8777, label: 'Mumbai, India' },
  'delhi': { lat: 28.6139, lon: 77.209, label: 'Delhi, India' },
  'new delhi': { lat: 28.6139, lon: 77.209, label: 'New Delhi, India' },
  'dubai': { lat: 25.2048, lon: 55.2708, label: 'Dubai, UAE' },
  'istanbul': { lat: 41.0082, lon: 28.9784, label: 'Istanbul, Turkey' },
  'tehran': { lat: 35.6892, lon: 51.389, label: 'Tehran, Iran' },
  'moscow': { lat: 55.7558, lon: 37.6173, label: 'Moscow, Russia' },
  'berlin': { lat: 52.52, lon: 13.405, label: 'Berlin, Germany' },
  'munich': { lat: 48.1351, lon: 11.582, label: 'Munich, Germany' },
  'madrid': { lat: 40.4168, lon: -3.7038, label: 'Madrid, Spain' },
  'barcelona': { lat: 41.3851, lon: 2.1734, label: 'Barcelona, Spain' },
  'rome': { lat: 41.9028, lon: 12.4964, label: 'Rome, Italy' },
  'milan': { lat: 45.4642, lon: 9.19, label: 'Milan, Italy' },
  'amsterdam': { lat: 52.3676, lon: 4.9041, label: 'Amsterdam, Netherlands' },
  'brussels': { lat: 50.8503, lon: 4.3517, label: 'Brussels, Belgium' },
  'vienna': { lat: 48.2082, lon: 16.3738, label: 'Vienna, Austria' },
  'zurich': { lat: 47.3769, lon: 8.5417, label: 'Zurich, Switzerland' },
  'lisbon': { lat: 38.7223, lon: -9.1393, label: 'Lisbon, Portugal' },
  'dublin': { lat: 53.3498, lon: -6.2603, label: 'Dublin, Ireland' },
  'stockholm': { lat: 59.3293, lon: 18.0686, label: 'Stockholm, Sweden' },
  'oslo': { lat: 59.9139, lon: 10.7522, label: 'Oslo, Norway' },
  'copenhagen': { lat: 55.6761, lon: 12.5683, label: 'Copenhagen, Denmark' },
  'helsinki': { lat: 60.1699, lon: 24.9384, label: 'Helsinki, Finland' },
  'warsaw': { lat: 52.2297, lon: 21.0122, label: 'Warsaw, Poland' },
  'athens': { lat: 37.9838, lon: 23.7275, label: 'Athens, Greece' },
  'cairo': { lat: 30.0444, lon: 31.2357, label: 'Cairo, Egypt' },
  'lagos': { lat: 6.5244, lon: 3.3792, label: 'Lagos, Nigeria' },
  'nairobi': { lat: -1.2921, lon: 36.8219, label: 'Nairobi, Kenya' },
  'johannesburg': { lat: -26.2041, lon: 28.0473, label: 'Johannesburg, South Africa' },
  'cape town': { lat: -33.9249, lon: 18.4241, label: 'Cape Town, South Africa' },
  'sydney': { lat: -33.8688, lon: 151.2093, label: 'Sydney, Australia' },
  'melbourne': { lat: -37.8136, lon: 144.9631, label: 'Melbourne, Australia' },
  'auckland': { lat: -36.8485, lon: 174.7633, label: 'Auckland, New Zealand' },
  'sao paulo': { lat: -23.5505, lon: -46.6333, label: 'São Paulo, Brazil' },
  'rio de janeiro': { lat: -22.9068, lon: -43.1729, label: 'Rio de Janeiro, Brazil' },
  'buenos aires': { lat: -34.6037, lon: -58.3816, label: 'Buenos Aires, Argentina' },
  'lima': { lat: -12.0464, lon: -77.0428, label: 'Lima, Peru' },
  'bogota': { lat: 4.711, lon: -74.0721, label: 'Bogotá, Colombia' },
};

let _full: Map<string, Place> | null = null;
let _loaded = false;

/** Load an optional full GeoNames extract once (best-effort). */
function full(): Map<string, Place> | null {
  if (_loaded) return _full;
  _loaded = true;
  try {
    const p = path.join(process.cwd(), 'data', 'cities.tsv');
    if (!fs.existsSync(p)) return (_full = null);
    const map = new Map<string, Place>();
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const c = line.split('\t');
      // GeoNames cities columns: 1=name, 4=lat, 5=lon, 8=country code, 14=population
      const name = c[1], lat = parseFloat(c[4]), lon = parseFloat(c[5]), cc = c[8];
      if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const key = norm(name);
      if (!map.has(key)) map.set(key, { lat, lon, label: cc ? `${name}, ${cc}` : name });
    }
    return (_full = map);
  } catch {
    return (_full = null);
  }
}

/** Resolve a place name to coordinates, or null. Seed first, then full set. */
export function lookupPlace(q: string): Place | null {
  const k = norm(q);
  if (!k) return null;
  if (SEED[k]) return SEED[k];
  const f = full();
  if (f?.has(k)) return f.get(k)!;
  // Loose fallback: a seed key that contains the query (e.g. "new york city").
  for (const [key, v] of Object.entries(SEED)) if (key.includes(k) || k.includes(key)) return v;
  return null;
}
