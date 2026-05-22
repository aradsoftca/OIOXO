import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-add-text',
  name: 'Add Text',
  blurb: 'Overlay a title or caption with full control over font, color, and position.',
  category: 'video', tile: 'M', icon: 'text', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['video', 'text', 'title', 'caption', 'overlay'], offline: true,
};
export default manifest;
