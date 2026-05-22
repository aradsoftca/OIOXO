import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-world-clock',
  name: 'World Clock',
  blurb: 'Live clocks across major cities and timezones at a glance.',
  category: 'time', tile: 'L', icon: 'globe', compute: 'instant',
  keywords: ['world clock', 'timezone', 'utc', 'cities'], offline: true,
};
export default manifest;
