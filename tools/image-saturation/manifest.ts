import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-saturation',
  name: 'Saturation',
  blurb: 'Make colors pop or fade. Live saturation slider.',
  category: 'image',
  tile: 'S',
  icon: 'droplet',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['saturation', 'vibrance', 'color boost', 'desaturate'],
  offline: true,
};

export default manifest;
