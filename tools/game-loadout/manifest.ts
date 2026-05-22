import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-loadout',
  name: 'Loadout Randomizer',
  blurb: 'Define your slots and options — get a random loadout for a fresh challenge run.',
  category: 'game', tile: 'M', icon: 'shuffle', compute: 'instant',
  keywords: ['loadout', 'randomizer', 'random', 'challenge', 'weapon', 'build'], offline: true,
};
export default manifest;
