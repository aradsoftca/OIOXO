import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-add-shadow',
  name: 'Add Shadow',
  blurb: 'Drop a soft shadow behind any image — great for product shots and mockups.',
  category: 'image',
  tile: 'M',
  icon: 'box-select',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png'],
  keywords: ['shadow', 'drop shadow', 'product shadow', 'mockup shadow', 'soft shadow'],
  pinDefault: false,
  offline: true,
};

export default manifest;
