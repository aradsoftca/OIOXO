import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-exif',
  name: 'Photo Metadata',
  blurb: 'Read camera, lens, GPS and every other EXIF tag from any photo.',
  category: 'image',
  tile: 'M',
  icon: 'info',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff', 'image/heic'],
  produces: ['application/json'],
  keywords: ['exif', 'metadata', 'photo info', 'gps location', 'camera info', 'image properties'],
  pinDefault: false,
  offline: true,
};

export default manifest;
