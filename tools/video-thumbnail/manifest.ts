import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-thumbnail',
  name: 'Video Thumbnail',
  blurb: 'Grab a frame at any moment — scrub the timeline and save it.',
  category: 'video', tile: 'M', icon: 'crop', compute: 'local',
  accepts: ['video/*'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['video', 'thumbnail', 'frame', 'screenshot', 'still'], offline: true, pinDefault: true,
};
export default manifest;
