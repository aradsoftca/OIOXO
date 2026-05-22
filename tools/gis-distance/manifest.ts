import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gis-distance',
  name: 'Distance Calculator',
  blurb: 'Great-circle distance and bearing between any two points on Earth.',
  category: 'gis', tile: 'M', icon: 'ruler', compute: 'instant',
  keywords: ['great circle', 'haversine', 'distance', 'bearing'], offline: true,
};
export default manifest;
