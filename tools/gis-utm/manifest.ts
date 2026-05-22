import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gis-utm',
  name: 'UTM Converter',
  blurb: 'Lat/lng → UTM zone, easting, and northing with hemisphere.',
  category: 'gis', tile: 'M', icon: 'compass', compute: 'instant',
  keywords: ['utm', 'zone', 'easting', 'northing', 'projection'], offline: true,
};
export default manifest;
