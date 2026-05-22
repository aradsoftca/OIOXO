import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-brightness',
  name: 'Brightness',
  blurb: 'Lift or darken any photo with a live slider — clip-aware.',
  category: 'image',
  tile: 'S',
  icon: 'sun-medium',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['brightness', 'exposure', 'lighten', 'darken', 'expose'],
  offline: true,
};

export default manifest;
