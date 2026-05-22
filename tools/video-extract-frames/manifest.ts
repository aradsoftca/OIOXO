import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-extract-frames',
  name: 'Extract Frames',
  blurb: 'Pull frames from any video and download them as a ZIP.',
  category: 'video', tile: 'M', icon: 'images', compute: 'local',
  accepts: ['video/*'],
  produces: ['application/zip'],
  keywords: ['video', 'frames', 'extract', 'png', 'zip'], offline: true,
};
export default manifest;
