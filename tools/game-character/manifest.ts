import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-character',
  name: 'Character Name',
  blurb: 'First name + last name combos for tabletop and RPG characters.',
  category: 'game', tile: 'M', icon: 'user-round', compute: 'instant',
  keywords: ['character name', 'rpg name', 'd&d', 'tabletop'], offline: true,
};
export default manifest;
