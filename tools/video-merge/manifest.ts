import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-merge',
  name: 'Merge Videos',
  blurb: 'Stitch multiple clips into one — drag to reorder, single MP4 output.',
  category: 'video', tile: 'L', icon: 'layers', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'merge', 'concat', 'join', 'combine'], offline: true,
};
export default manifest;
