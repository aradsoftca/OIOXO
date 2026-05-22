import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-collage',
  name: 'Image Collage',
  blurb: 'Arrange 2–9 photos into a clean grid — pick a layout, set the gap, export as PNG.',
  category: 'image',
  tile: 'L',
  icon: 'grid-3x3',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['collage', 'photo grid', 'photo collage', 'image grid', 'photo layout'],
  pinDefault: false,
  offline: true,
};

export default manifest;
