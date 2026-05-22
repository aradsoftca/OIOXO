import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-rotate',
  name: 'Rotate Video',
  blurb: 'Rotate 90°, 180°, 270° — fixes phone footage shot sideways.',
  category: 'video', tile: 'M', icon: 'rotate-cw', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'rotate', 'turn', '90 degrees', 'sideways'], offline: true,
};
export default manifest;
