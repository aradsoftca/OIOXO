import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-poster',
  name: 'Video Poster',
  blurb: 'Save the first frame as a perfect cover image — PNG or JPG.',
  category: 'video', tile: 'M', icon: 'image', compute: 'local',
  accepts: ['video/*'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['video', 'poster', 'cover', 'first frame', 'thumbnail'], offline: true,
};
export default manifest;
