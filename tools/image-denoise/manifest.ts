import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-denoise',
  name: 'Denoise Image',
  blurb: 'Smooth out grain and noise while keeping edges sharp — runs on your device.',
  category: 'image',
  tile: 'M',
  icon: 'sparkles',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['denoise', 'noise reduction', 'remove grain', 'smooth photo', 'clean image', 'reduce noise'],
  pinDefault: false,
  offline: true,
};

export default manifest;
