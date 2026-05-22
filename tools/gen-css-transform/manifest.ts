import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-css-transform',
  name: 'CSS Transform',
  blurb: 'Translate, rotate, scale and skew on a live preview — copy the CSS transform.',
  category: 'generator', tile: 'M', icon: 'move-3d', compute: 'instant',
  keywords: ['css', 'transform', 'rotate', 'scale', 'skew', 'translate'],
  offline: true,
};
export default manifest;
