import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-invert',
  name: 'Invert Colors',
  blurb: 'Flip every pixel to its opposite — instant negative effect.',
  category: 'image',
  tile: 'S',
  icon: 'contrast',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['invert', 'negative', 'reverse colors', 'film negative'],
  offline: true,
};

export default manifest;
