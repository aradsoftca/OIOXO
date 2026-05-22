import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-brightness',
  name: 'Adjust Brightness',
  blurb: 'Tune brightness, contrast, and saturation — make footage pop.',
  category: 'video', tile: 'M', icon: 'sun', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'brightness', 'contrast', 'saturation', 'color'], offline: true,
};
export default manifest;
