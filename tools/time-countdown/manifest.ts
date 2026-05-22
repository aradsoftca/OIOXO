import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-countdown',
  name: 'Countdown',
  blurb: 'Live countdown to any future date — copy the link to share.',
  category: 'time', tile: 'M', icon: 'timer', compute: 'instant',
  keywords: ['countdown', 'timer', 'until'], offline: true,
};
export default manifest;
