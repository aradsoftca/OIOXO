import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-grayscale',
  name: 'Grayscale',
  blurb: 'Drain color from any photo. Live amount slider, lossless save.',
  category: 'image',
  tile: 'M',
  icon: 'circle-dashed',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['grayscale', 'black and white', 'desaturate', 'monochrome', 'b&w'],
  offline: true,
};

export default manifest;
