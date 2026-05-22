import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-thumbnails-grid',
  name: 'Thumbnails Sheet',
  blurb: 'Build a sprite sheet — every key moment of your video on one image.',
  category: 'video', tile: 'L', icon: 'layout-grid', compute: 'local',
  accepts: ['video/*'],
  produces: ['image/jpeg'],
  keywords: ['video', 'thumbnails', 'grid', 'sprite sheet', 'contact sheet'], offline: true,
};
export default manifest;
