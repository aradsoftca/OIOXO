import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-round-corners',
  name: 'Round Corners',
  blurb: 'Soft rounded corners with a transparent PNG output.',
  category: 'image',
  tile: 'M',
  icon: 'square-rounded',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/webp'],
  keywords: ['round corners', 'rounded', 'corner radius', 'mask', 'rounded rectangle'],
  offline: true,
};

export default manifest;
