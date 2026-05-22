import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-favicon',
  name: 'Favicon Generator',
  blurb: 'One image → favicon set at every needed size, ready to ship.',
  category: 'generator', tile: 'M', icon: 'image-down', compute: 'local',
  accepts: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  produces: ['image/png'],
  keywords: ['favicon', 'app icon', 'web icon', 'icon set'], offline: true,
};
export default manifest;
