import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-info',
  name: 'Image Info',
  blurb: 'Inspect dimensions, format, size, aspect — all the technical metadata.',
  category: 'image',
  tile: 'M',
  icon: 'info',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'],
  produces: [],
  keywords: ['image info', 'metadata', 'dimensions', 'exif', 'inspect', 'analyze'],
  offline: true,
};

export default manifest;
