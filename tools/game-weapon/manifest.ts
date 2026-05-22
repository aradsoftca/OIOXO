import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-weapon',
  name: 'Weapon Name',
  blurb: 'Legendary weapon names — Razorblade of the Wolf, Doomhammer.',
  category: 'game', tile: 'M', icon: 'swords', compute: 'instant',
  keywords: ['weapon name', 'legendary', 'sword', 'rpg loot'], offline: true,
};
export default manifest;
