import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-pattern',
  name: 'Pattern Tile',
  blurb: 'Turn any image into a seamless tile — mirror, half-drop, brick offset.',
  category: 'image',
  tile: 'M',
  icon: 'grid-2x2',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['pattern', 'tile', 'seamless', 'background pattern', 'repeat tile', 'mirror tile'],
  pinDefault: false,
  offline: true,
};

export default manifest;
