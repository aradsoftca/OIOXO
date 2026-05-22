import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-watermark',
  name: 'Add Watermark',
  blurb: 'Stamp text in a corner of every frame — yours, forever.',
  category: 'video', tile: 'M', icon: 'badge', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'watermark', 'overlay', 'brand'], offline: true,
};
export default manifest;
