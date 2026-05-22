import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-flip',
  name: 'Flip Video',
  blurb: 'Mirror your video horizontally or vertically — instant correction.',
  category: 'video', tile: 'M', icon: 'flip-horizontal-2', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'flip', 'mirror', 'reverse', 'horizontal'], offline: true,
};
export default manifest;
