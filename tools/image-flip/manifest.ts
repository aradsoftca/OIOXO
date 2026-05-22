import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-flip',
  name: 'Flip',
  blurb: 'Mirror horizontally, vertically, or both — pixel-perfect.',
  category: 'image',
  tile: 'S',
  icon: 'flip-horizontal-2',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['flip', 'mirror', 'reverse', 'reflect'],
  offline: true,
};

export default manifest;
