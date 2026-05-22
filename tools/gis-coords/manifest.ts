import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gis-coords',
  name: 'Coordinate Converter',
  blurb: 'Decimal degrees ↔ DMS ↔ UTM — paste any format, get them all.',
  category: 'gis', tile: 'M', icon: 'map-pin', compute: 'instant',
  keywords: ['gis', 'coordinates', 'lat lng', 'dms', 'utm'], offline: true,
};
export default manifest;
