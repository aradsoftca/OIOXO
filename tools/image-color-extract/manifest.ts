import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-color-extract',
  name: 'Color Extractor',
  blurb: 'Pull the dominant colors out of any image — palette, percentages, copy hex.',
  category: 'image',
  tile: 'M',
  icon: 'palette',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['text/plain', 'application/json'],
  keywords: ['color palette', 'dominant color', 'extract colors', 'palette generator', 'image colors'],
  pinDefault: false,
  offline: true,
};

export default manifest;
