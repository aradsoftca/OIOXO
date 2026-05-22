import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-trim',
  name: 'Trim Video',
  blurb: 'Cut the start and end of a video — precise to the frame.',
  category: 'video', tile: 'L', icon: 'scissors', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/webm'],
  keywords: ['video', 'trim', 'cut', 'crop', 'shorten'], offline: true, pinDefault: true,
};
export default manifest;
