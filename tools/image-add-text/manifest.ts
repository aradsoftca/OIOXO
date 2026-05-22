import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-add-text',
  name: 'Add Text',
  blurb: 'Overlay text at any position with custom font, size, color, and stroke.',
  category: 'image', tile: 'M', icon: 'text', compute: 'local',
  accepts: ['image/*'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['image', 'text', 'caption', 'title', 'overlay'], offline: true,
};
export default manifest;
