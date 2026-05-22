import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-pixelate',
  name: 'Pixelate',
  blurb: 'Mosaic any photo — block size from 2 to 128 pixels, live preview.',
  category: 'image',
  tile: 'S',
  icon: 'grid-3x3',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['pixelate', 'mosaic', 'censor', '8-bit', 'retro'],
  offline: true,
};

export default manifest;
