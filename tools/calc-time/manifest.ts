import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-time',
  name: 'Time Calculator',
  blurb: 'Add or subtract durations — hours, minutes, seconds.',
  category: 'calc', tile: 'M', icon: 'clock', compute: 'instant',
  keywords: ['time arithmetic', 'duration', 'hours minutes seconds'], offline: true,
};
export default manifest;
