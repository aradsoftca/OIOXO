import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-quest',
  name: 'Quest Name',
  blurb: 'Quest titles for adventures — Trial of the Iron Wolf, Last Stand of Ashfall.',
  category: 'game', tile: 'M', icon: 'scroll-text', compute: 'instant',
  keywords: ['quest name', 'adventure', 'mission'], offline: true,
};
export default manifest;
