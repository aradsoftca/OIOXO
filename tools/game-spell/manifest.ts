import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-spell',
  name: 'Spell Name',
  blurb: 'RPG spell names — Arcane Bolt, Shadow Curse, Holy Surge.',
  category: 'game', tile: 'M', icon: 'sparkles', compute: 'instant',
  keywords: ['spell name', 'magic', 'rpg', 'd&d'], offline: true,
};
export default manifest;
