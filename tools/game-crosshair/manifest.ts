import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-crosshair',
  name: 'Crosshair Maker',
  blurb: 'Design a crosshair — pip, lines, gap, outline — and export PNG.',
  category: 'game', tile: 'M', icon: 'crosshair', compute: 'instant',
  keywords: ['crosshair', 'reticle', 'aim', 'overlay'], offline: true,
};
export default manifest;
