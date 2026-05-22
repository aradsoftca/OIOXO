import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-crop',
  name: 'Crop Video',
  blurb: 'Crop to a specific aspect ratio or pixel region — keep what matters.',
  category: 'video', tile: 'M', icon: 'crop', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'crop', 'aspect ratio', 'trim edges'], offline: true,
};
export default manifest;
