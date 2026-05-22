import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-contrast',
  name: 'Contrast',
  blurb: 'Punchier mids, deeper shadows. Live contrast slider.',
  category: 'image',
  tile: 'S',
  icon: 'contrast',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['contrast', 'punch', 'midtones', 'highlights'],
  offline: true,
};

export default manifest;
