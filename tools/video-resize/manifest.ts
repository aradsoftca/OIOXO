import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-resize',
  name: 'Resize Video',
  blurb: 'Scale a video to any width — height follows automatically.',
  category: 'video', tile: 'M', icon: 'maximize-2', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'resize', 'scale', 'dimensions', 'width'], offline: true,
};
export default manifest;
