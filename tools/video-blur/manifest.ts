import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-blur',
  name: 'Blur Video',
  blurb: 'Soften the frame with adjustable blur — great for backgrounds.',
  category: 'video', tile: 'M', icon: 'droplet', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'blur', 'soften', 'background'], offline: true,
};
export default manifest;
