/**
 * oioxo AI — geography intent + on-device calculation (ANSWER_BRAIN "maps").
 *
 * The model does NOT understand maps — it understands the QUESTION. This reads a
 * geo intent ("how far is X from Y", "where is X", "distance between A and B"),
 * the deterministic layer geocodes the places (own /api/geo, local gazetteer —
 * no third party) and computes on-device (haversine), and the answer is stated
 * plainly + shown on a web map. Same pattern as search/translation: understand →
 * compute → present.
 *
 * THIN floor (the trained encoder refines intent + place extraction later).
 * Pure math is on-device; geocoding is a one-call fetch to our own server.
 */

export type GeoOp = 'distance' | 'where';
export interface GeoIntent {
  op: GeoOp;
  /** Place name(s): two for a distance, one for a lookup. */
  places: string[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  /** Resolved display label (e.g. "Paris, France"). */
  label: string;
}

const clean = (s: string) =>
  s.replace(/[?.!,]+$/g, '').replace(/^\s*(the|a|an)\s+/i, '').replace(/\s+/g, ' ').trim();

/**
 * Detect a geography question and pull the place name(s). Structural patterns
 * only (no gazetteer of place names) so it generalizes to anywhere:
 *   "how far is X from Y" · "distance between X and Y" · "distance from X to Y"
 *   "X to Y distance" · "where is X" · "coordinates/location of X".
 */
export function detectGeoIntent(text: string): GeoIntent | null {
  const t = text.trim();

  // ROAD/DRIVING questions ("how long to drive A→B", "driving distance", "by
  // car/road", "route from…") are answered as a FACT by search — a world road
  // graph is gigabytes, too big for on-device. Let these fall through so the
  // search→analyze→answer brain handles them. On-device haversine stays for the
  // straight-line "how far is X from Y".
  if (/\b(driv\w+|by car|by road|by bus|by train|road trip|commute|how long to (get|travel|reach|drive)|travel time|fastest (way|route)|directions?)\b/i.test(t)) {
    return null;
  }

  // distance — two places, several phrasings
  let m =
    t.match(/\bhow far\s+(?:is\s+|from\s+)?(.+?)\s+(?:from|to)\s+(.+)$/i) ||
    t.match(/\bdistance\s+(?:between)\s+(.+?)\s+and\s+(.+)$/i) ||
    t.match(/\bdistance\s+(?:from\s+)?(.+?)\s+to\s+(.+)$/i) ||
    t.match(/\b(.+?)\s+to\s+(.+?)\s+(?:distance|how far|km|miles)\b/i);
  if (m) {
    const a = clean(m[1]); const b = clean(m[2]);
    if (a && b && a.length <= 60 && b.length <= 60) return { op: 'distance', places: [a, b] };
  }

  // where / coordinates — one place
  m = t.match(/\bwhere\s+is\s+(.+)$/i) ||
      t.match(/\b(?:coordinates|coords|lat(?:itude)?\/?long(?:itude)?|location)\s+of\s+(.+)$/i);
  if (m) {
    const p = clean(m[1]);
    if (p && p.length <= 60) return { op: 'where', places: [p] };
  }
  return null;
}

/** Great-circle distance in km (haversine) — pure on-device math. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Geocode a place name — fully ON-DEVICE (cached world-cities gazetteer in the
 *  browser, no server, no third party). Null if not found. */
export async function geocode(place: string): Promise<GeoPoint | null> {
  const { geocodeLocal } = await import('../geo/geocoder');
  return geocodeLocal(place);
}

const km2mi = (km: number) => km * 0.621371;
const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(n >= 10 ? 0 : 1));

export interface GeoReply {
  text: string;
  points: GeoPoint[];
  /** Draw a line between the two points (a distance answer). */
  line?: boolean;
}

/**
 * Resolve a geo intent into a stated answer + map points. Deterministic and
 * accurate (it's a calculation, not prose synthesis). Null if a place can't be
 * geocoded → caller falls back to normal search.
 */
export async function answerGeo(intent: GeoIntent): Promise<GeoReply | null> {
  if (intent.op === 'where') {
    const p = await geocode(intent.places[0]);
    if (!p) return null;
    return { text: `**${p.label}** is at ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}.`, points: [p] };
  }
  // distance
  const [a, b] = await Promise.all(intent.places.slice(0, 2).map(geocode));
  if (!a || !b) return null;
  const km = haversineKm(a, b);
  return {
    text: `**${a.label}** and **${b.label}** are about **${fmt(km)} km** (${fmt(km2mi(km))} mi) apart in a straight line.`,
    points: [a, b],
    line: true,
  };
}
