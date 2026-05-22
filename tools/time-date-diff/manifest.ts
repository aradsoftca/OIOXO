import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-date-diff',
  name: 'Date Difference',
  blurb: 'Days, workdays, weekends, months between two dates.',
  category: 'time', tile: 'M', icon: 'calendar-days', compute: 'instant',
  keywords: ['date difference', 'workdays', 'business days', 'date diff'], offline: true,
};
export default manifest;
