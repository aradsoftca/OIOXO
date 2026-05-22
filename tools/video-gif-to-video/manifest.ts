import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-gif-to-video',
  name: 'GIF to Video',
  blurb: 'Turn an animated GIF into a small, smooth MP4 — far lighter than the GIF.',
  category: 'video',
  tile: 'M',
  icon: 'file-video',
  compute: 'local',
  accepts: ['image/gif'],
  produces: ['video/mp4'],
  keywords: ['gif to mp4', 'gif to video', 'convert gif', 'animated gif', 'gif converter'],
  pinDefault: false,
  offline: true,
};

export default manifest;
