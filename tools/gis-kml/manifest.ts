import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gis-kml',
  name: 'KML → GeoJSON',
  blurb: 'Convert Google Earth KML to clean GeoJSON for any mapping library.',
  category: 'gis', tile: 'M', icon: 'globe', compute: 'instant',
  keywords: ['kml', 'geojson', 'google earth', 'convert'], offline: true,
};
export default manifest;
