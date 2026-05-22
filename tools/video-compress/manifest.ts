import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-compress',
  name: 'Compress Video',
  blurb: 'Shrink video size with smart quality trade-offs — pick the target.',
  category: 'video', tile: 'L', icon: 'minimize-2', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'compress', 'shrink', 'smaller', 'reduce size'], offline: true, pinDefault: true,
};
export default manifest;
