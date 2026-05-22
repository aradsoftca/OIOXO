import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-cron',
  name: 'Cron Expression',
  blurb: 'Decode a cron expression and preview the next runs.',
  category: 'time', tile: 'M', icon: 'clock', compute: 'instant',
  keywords: ['cron', 'schedule', 'cron expression', 'next run'], offline: true,
};
export default manifest;
