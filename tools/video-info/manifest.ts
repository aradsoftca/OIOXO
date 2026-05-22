import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-info',
  name: 'Video Info',
  blurb: 'See dimensions, duration, aspect ratio, and audio status — at a glance.',
  category: 'video', tile: 'M', icon: 'info', compute: 'local',
  accepts: ['video/*'],
  keywords: ['video', 'info', 'metadata', 'inspect', 'dimensions'], offline: true,
};
export default manifest;
