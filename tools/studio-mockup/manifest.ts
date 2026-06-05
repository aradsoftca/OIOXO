import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-mockup',
  name: 'Screenshot Studio',
  blurb: 'Make screenshots beautiful — drop one on a gradient backdrop with padding, rounded corners, a shadow and an optional window frame. Export PNG.',
  category: 'image',
  tile: 'L',
  icon: 'image',
  compute: 'instant',
  accepts: ['image/*'],
  produces: ['image/png'],
  keywords: ['screenshot beautifier', 'mockup generator', 'screenshot background', 'pretty screenshots', 'device frame', 'gradient background'],
  offline: true,
};

export default manifest;
