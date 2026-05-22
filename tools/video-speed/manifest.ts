import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-speed',
  name: 'Change Video Speed',
  blurb: 'Speed up or slow down a video — audio stays in tune.',
  category: 'video', tile: 'M', icon: 'fast-forward', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'speed', 'slow motion', 'fast forward', 'time lapse'], offline: true,
};
export default manifest;
