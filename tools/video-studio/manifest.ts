import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-studio',
  name: 'Video Studio',
  blurb: 'A timeline video editor in your browser — add clips, trim each, reorder, change speed, and stitch them into one video. Runs on your device.',
  category: 'video', tile: 'L', icon: 'clapperboard', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video editor', 'timeline', 'trim', 'merge clips', 'join videos', 'reorder', 'speed', 'montage', 'studio', 'combine video'],
  offline: true,
  pinDefault: true,
};
export default manifest;
