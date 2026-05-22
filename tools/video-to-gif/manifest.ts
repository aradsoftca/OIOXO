import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-to-gif',
  name: 'Video → GIF',
  blurb: 'Turn a clip into an animated GIF — pick the range, frame rate, and size.',
  category: 'video', tile: 'L', icon: 'film', compute: 'local',
  accepts: ['video/*'],
  produces: ['image/gif'],
  keywords: ['video', 'gif', 'animated', 'meme', 'loop'], offline: true, pinDefault: true,
};
export default manifest;
