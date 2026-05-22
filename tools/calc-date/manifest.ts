import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-date',
  name: 'Date Difference',
  blurb: 'How many days, weeks, months between any two dates?',
  category: 'calc', tile: 'M', icon: 'calendar', compute: 'instant',
  keywords: ['date diff', 'days between', 'date math'], offline: true,
};
export default manifest;
