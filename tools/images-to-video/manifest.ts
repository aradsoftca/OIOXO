import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'images-to-video',
  name: 'Photos to Video',
  blurb: 'Turn a photo (or a whole set) into an MP4 slideshow — any image format in.',
  category: 'video',
  tile: 'L',
  icon: 'clapperboard',
  compute: 'local',
  accepts: ['image/bmp', 'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff'],
  produces: ['video/mp4'],
  keywords: ['images to video', 'photo slideshow', 'bmp to mp4', 'jpg to mp4', 'png to video', 'picture to video', 'slideshow maker'],
  pinDefault: false,
  offline: true,
};

export default manifest;
