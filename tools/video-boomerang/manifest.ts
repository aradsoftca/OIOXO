import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-boomerang', name: 'Boomerang',
  blurb: 'Turn a clip into a seamless forward-and-back boomerang loop, like Instagram.',
  category: 'video', tile: 'M', icon: 'repeat', compute: 'local',
  accepts: ['video/*'], produces: ['video/mp4'],
  keywords: ['boomerang', 'loop video', 'reverse loop', 'instagram boomerang', 'ping pong video'], offline: true,
};
export default manifest;
