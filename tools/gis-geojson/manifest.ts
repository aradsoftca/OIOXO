import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gis-geojson',
  name: 'GeoJSON Inspector',
  blurb: 'Validate GeoJSON, count features, compute bounding box and centroid.',
  category: 'gis', tile: 'M', icon: 'square-stack', compute: 'instant',
  keywords: ['geojson', 'inspect', 'validator', 'bbox', 'centroid'], offline: true,
};
export default manifest;
