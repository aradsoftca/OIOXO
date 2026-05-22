import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-crop',
  name: 'Crop Image',
  blurb: 'Drag a marquee or pick an aspect ratio — export exactly what you need.',
  category: 'image', tile: 'M', icon: 'crop', compute: 'local',
  accepts: ['image/*'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['image', 'crop', 'aspect ratio', 'cut', 'trim'], offline: true,
};
export default manifest;
