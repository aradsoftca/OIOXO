import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-fantasy',
  name: 'Fantasy Name',
  blurb: 'Epic fantasy names — Stormwarden, Frostfall, Ironwolf.',
  category: 'game', tile: 'M', icon: 'wand-2', compute: 'instant',
  keywords: ['fantasy name', 'rpg', 'mage', 'warrior'], offline: true,
};
export default manifest;
