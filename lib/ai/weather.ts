/**
 * weather — live local weather from open-meteo (free, no key, CORS-open: verified
 * access-control-allow-origin:*). Part of the locale-aware vision: "weather" with
 * no place uses the user's OWN city, derived from the browser timezone WITHOUT a
 * permission prompt (America/Toronto → Toronto, Asia/Kolkata → Kolkata, Europe/Rome
 * → Rome). Output is plain English; the translation shell at respond() renders it
 * in the user's language — so a user in Riyadh gets the weather in Arabic.
 */

// WMO weather interpretation codes → short text.
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow',
  77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'violent showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

const WEATHER_RE = /\b(weather|temperature|forecast|how (hot|cold|warm) is it|is it (going to |gonna )?(rain|snow|sunny)|how's the weather|whats? the weather)\b/i;

/** The user's city from the browser/runtime timezone — no geolocation permission.
 *  "America/Toronto" → "Toronto", "Asia/Kolkata" → "Kolkata". */
export function cityFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const city = tz.split('/').pop() || '';
    return city ? city.replace(/_/g, ' ') : null;
  } catch { return null; }
}

/** Parse a weather question → the place, or '' to mean "the user's own location". */
function parsePlace(q: string): string | null {
  if (!WEATHER_RE.test(q)) return null;
  const m = q.match(/\b(?:in|at|for|of)\s+([A-Za-zÀ-ÿ][\p{L}.\- ]{1,40})$/u);
  return m ? m[1].replace(/[?.!,]+$/, '').trim() : '';
}

async function geocode(place: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { cache: 'no-store' });
    if (!r.ok) return null;
    const g = (await r.json())?.results?.[0];
    if (!g) return null;
    return { lat: g.latitude, lon: g.longitude, label: [g.name, g.admin1, g.country].filter(Boolean).slice(0, 2).join(', ') };
  } catch { return null; }
}

/** Answer a weather question with a live forecast, or null (→ normal flow). The
 *  caller passes the user's locale city for the bare "weather" case. */
export async function weatherAnswer(query: string, userCity?: string | null): Promise<{ text: string; source: { title: string; url: string; site: string } } | null> {
  const parsed = parsePlace(query);
  if (parsed === null) return null;                 // not a weather question
  const place = parsed || userCity || cityFromTimezone();
  if (!place) return null;                           // no place and no locale → fall through
  const geo = await geocode(place);
  if (!geo) return null;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    const cur = d.current; const day = d.daily;
    if (!cur) return null;
    const now = `${Math.round(cur.temperature_2m)}°C, ${WMO[cur.weather_code] ?? 'mixed conditions'}`;
    const wind = cur.wind_speed_10m != null ? `, wind ${Math.round(cur.wind_speed_10m)} km/h` : '';
    const today = day ? ` Today ${Math.round(day.temperature_2m_min[0])}–${Math.round(day.temperature_2m_max[0])}°C.` : '';
    const tmrw = day && day.temperature_2m_max[1] != null ? ` Tomorrow ${Math.round(day.temperature_2m_min[1])}–${Math.round(day.temperature_2m_max[1])}°C, ${WMO[day.weather_code[1]] ?? 'mixed'}.` : '';
    return {
      text: `Weather in ${geo.label}: ${now}${wind}.${today}${tmrw}`,
      source: { title: `${geo.label} forecast`, url: `https://open-meteo.com/`, site: 'open-meteo.com' },
    };
  } catch { return null; }
}
