import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-aspect-ratio',
  name: 'Aspect Ratio',
  blurb: 'Resolution → aspect ratio, plus matching resolutions at every common size.',
  category: 'game', tile: 'M', icon: 'monitor', compute: 'instant',
  keywords: ['aspect ratio', '16:9', '21:9', 'ultrawide', 'monitor'], offline: true,
};
export default manifest;
