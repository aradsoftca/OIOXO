/**
 * GIS math + format helpers — DD/DMS conversion, haversine distance, UTM,
 * basic KML→GeoJSON conversion.
 */

export interface LatLng { lat: number; lng: number }

/** Parse "37.7749, -122.4194" or "37° 46' 30\" N, 122° 25' 9\" W" etc. */
export function parseCoord(s: string): LatLng | null {
  const cleaned = s.trim();
  if (!cleaned) return null;
  // Decimal-degrees "lat, lng"
  const dd = /^(-?\d+(?:\.\d+)?)\s*[, ]+\s*(-?\d+(?:\.\d+)?)$/.exec(cleaned);
  if (dd) return { lat: Number(dd[1]), lng: Number(dd[2]) };
  // DMS: degrees minutes seconds with N/S, E/W
  const parts = cleaned.split(/\s*[,]\s*|\s+(?=[\d-])/);
  if (parts.length === 2) {
    const lat = parseDms(parts[0]);
    const lng = parseDms(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function parseDms(s: string): number {
  const m = /(-?)\s*(\d+(?:\.\d+)?)[°d]?\s*(?:(\d+(?:\.\d+)?)[']?)?\s*(?:(\d+(?:\.\d+)?)["s]?)?\s*([NnSsEeWw])?/.exec(s.trim());
  if (!m) return Number.NaN;
  const deg = Number(m[2]);
  const min = m[3] ? Number(m[3]) : 0;
  const sec = m[4] ? Number(m[4]) : 0;
  let v = deg + min / 60 + sec / 3600;
  const dir = m[5];
  if (m[1] === '-' || dir === 'S' || dir === 's' || dir === 'W' || dir === 'w') v = -v;
  return v;
}

/** Format decimal degrees → DMS string. */
export function ddToDms(value: number, kind: 'lat' | 'lng'): string {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minF = (abs - deg) * 60;
  const min = Math.floor(minF);
  const sec = (minF - min) * 60;
  const hemi = kind === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${deg}° ${min}' ${sec.toFixed(2)}" ${hemi}`;
}

/** Haversine distance between two points in meters. */
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from A to B in degrees (0..360). */
export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Lat/lng → UTM (zone + easting + northing + hemisphere). */
export function llToUtm({ lat, lng }: LatLng): { zone: number; hemisphere: 'N' | 'S'; easting: number; northing: number } {
  const a = 6378137;
  const e = 0.0818191908426;
  const k0 = 0.9996;
  const zone = Math.floor((lng + 180) / 6) + 1;
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  const lambda = lng * (Math.PI / 180);
  const N = a / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = (e * e * Math.cos(phi) ** 2) / (1 - e * e);
  const A2 = Math.cos(phi) * (lambda - lambda0);
  const M = a * (
    (1 - (e * e) / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256) * phi
    - ((3 * e * e) / 8 + (3 * e ** 4) / 32 + (45 * e ** 6) / 1024) * Math.sin(2 * phi)
    + ((15 * e ** 4) / 256 + (45 * e ** 6) / 1024) * Math.sin(4 * phi)
    - ((35 * e ** 6) / 3072) * Math.sin(6 * phi)
  );
  const easting = k0 * N * (A2 + ((1 - T + C) * A2 ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * (e * e) / (1 - e * e)) * A2 ** 5) / 120) + 500000;
  let northing = k0 * (M + N * Math.tan(phi) * (
    (A2 ** 2) / 2
    + ((5 - T + 9 * C + 4 * C * C) * A2 ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * (e * e) / (1 - e * e)) * A2 ** 6) / 720
  ));
  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10_000_000;
  return { zone, hemisphere, easting, northing };
}

/**
 * Tiny KML→GeoJSON for Point / LineString / Polygon. Drops styles + extended
 * data. Good enough for inspection and conversion.
 */
export function kmlToGeoJson(kml: string): unknown {
  const features: unknown[] = [];
  const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g;
  let m: RegExpExecArray | null;
  while ((m = placemarkRe.exec(kml)) !== null) {
    const block = m[1];
    const name = /<name\b[^>]*>([\s\S]*?)<\/name>/.exec(block)?.[1]?.trim() ?? '';
    const desc = /<description\b[^>]*>([\s\S]*?)<\/description>/.exec(block)?.[1]?.trim() ?? '';
    const props: Record<string, string> = {};
    if (name) props.name = name;
    if (desc) props.description = desc;

    const pointCoords = /<Point\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/.exec(block);
    if (pointCoords) {
      const [lng, lat] = pointCoords[1].trim().split(',').map(Number);
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
      continue;
    }
    const lineCoords = /<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/.exec(block);
    if (lineCoords) {
      const coords = lineCoords[1].trim().split(/\s+/).map((p) => p.split(',').map(Number).slice(0, 2));
      features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
      continue;
    }
    const polyOuter = /<Polygon\b[^>]*>[\s\S]*?<outerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/.exec(block);
    if (polyOuter) {
      const ring = polyOuter[1].trim().split(/\s+/).map((p) => p.split(',').map(Number).slice(0, 2));
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });
      continue;
    }
  }
  return { type: 'FeatureCollection', features };
}
