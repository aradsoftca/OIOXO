import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-placeholder',
  name: 'Placeholder Generator',
  blurb: 'Solid color or gradient placeholders for mockups, designs, and tests.',
  category: 'image',
  tile: 'M',
  icon: 'square-dashed',
  compute: 'instant',
  accepts: [],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['placeholder', 'mockup', 'dummy', 'test image', 'lorem picsum'],
  offline: true,
};

export default manifest;
