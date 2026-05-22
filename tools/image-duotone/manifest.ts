import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-duotone',
  name: 'Duotone',
  blurb: 'Map any photo onto two colors — bold editorial duotone in one click.',
  category: 'image',
  tile: 'M',
  icon: 'contrast',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['duotone', 'two tone', 'color map', 'gradient map', 'editorial photo', 'spotify effect'],
  pinDefault: false,
  offline: true,
};

export default manifest;
