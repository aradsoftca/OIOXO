import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-username',
  name: 'Username Generator',
  blurb: 'Generate unique gamer handles — adjective + animal + number combos.',
  category: 'game', tile: 'M', icon: 'user', compute: 'instant',
  keywords: ['username', 'handle', 'gamer name'], offline: true,
};
export default manifest;
