'use client';
import { TextTool } from '@/components/tool/TextTool';

interface Geom {
  type: string;
  coordinates?: unknown;
  geometries?: Geom[];
}

interface Feature {
  type: 'Feature';
  geometry: Geom | null;
  properties?: Record<string, unknown>;
}

interface FC {
  type: 'FeatureCollection';
  features: Feature[];
}

function isFc(x: unknown): x is FC {
  return Boolean(x && typeof x === 'object' && (x as { type?: string }).type === 'FeatureCollection');
}

function flattenCoords(g: Geom | null, out: number[][]) {
  if (!g) return;
  if (g.type === 'GeometryCollection' && g.geometries) {
    g.geometries.forEach((child) => flattenCoords(child, out));
    return;
  }
  const c = g.coordinates as unknown;
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      if (typeof n[0] === 'number' && typeof n[1] === 'number') {
        out.push([Number(n[0]), Number(n[1])]);
      } else {
        n.forEach(visit);
      }
    }
  };
  visit(c);
}

export default function Tool() {
  return (
    <TextTool
      toolId="gis-geojson"
      colorVar="--color-cat-gis"
      inputPlaceholder="Paste GeoJSON here…"
      transform={(s) => {
        if (!s.trim()) return '';
        let json: unknown;
        try { json = JSON.parse(s); }
        catch (e) { return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`; }

        const points: number[][] = [];
        const types = new Map<string, number>();
        let featureCount = 0;
        if (isFc(json)) {
          featureCount = json.features.length;
          for (const f of json.features) {
            const t = f.geometry?.type ?? 'null';
            types.set(t, (types.get(t) ?? 0) + 1);
            flattenCoords(f.geometry, points);
          }
        } else if (json && typeof json === 'object') {
          const obj = json as Geom;
          if (obj.type) {
            featureCount = 1;
            types.set(obj.type, 1);
            flattenCoords(obj as Geom, points);
          }
        }
        if (points.length === 0) return `Found ${featureCount} feature(s). No coordinates to summarize.`;

        // Fold-based bbox — a real-world GeoJSON (country borders, OSM
        // extract) can hold millions of points; Math.min/max(...arr) blows
        // V8's argument-count stack on arrays > ~120k entries. One pass
        // computes both extrema for both axes without spreading.
        let minLng = points[0][0], maxLng = minLng;
        let minLat = points[0][1], maxLat = minLat;
        let sumLng = 0, sumLat = 0;
        for (const [lng, lat] of points) {
          if (lng < minLng) minLng = lng; else if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat; else if (lat > maxLat) maxLat = lat;
          sumLng += lng; sumLat += lat;
        }
        const bbox = [minLng, minLat, maxLng, maxLat];
        const centroidLng = sumLng / points.length;
        const centroidLat = sumLat / points.length;

        return [
          `Features: ${featureCount}`,
          `Geometry types: ${Array.from(types.entries()).map(([t, n]) => `${t} × ${n}`).join(', ')}`,
          `Total points: ${points.length}`,
          '',
          `BBox: [${bbox.map((n) => n.toFixed(6)).join(', ')}]`,
          `Centroid: ${centroidLat.toFixed(6)}, ${centroidLng.toFixed(6)}`,
          '',
          `Map preview: https://geojson.io/#data=data:application/json,${encodeURIComponent(JSON.stringify(json))}`.slice(0, 220) + (s.length > 220 ? '…' : ''),
        ].join('\n');
      }}
    />
  );
}
