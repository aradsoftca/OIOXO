import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-fov',
  name: 'FOV Calculator',
  blurb: 'Convert horizontal ↔ vertical FOV for any aspect ratio.',
  category: 'game', tile: 'M', icon: 'aperture', compute: 'instant',
  keywords: ['fov', 'field of view', 'horizontal fov', 'vertical fov'], offline: true,
};
export default manifest;
