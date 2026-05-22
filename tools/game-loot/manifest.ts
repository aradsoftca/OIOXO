import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-loot',
  name: 'Loot Box',
  blurb: 'Open virtual loot boxes — Common, Rare, Epic, Legendary drops.',
  category: 'game', tile: 'M', icon: 'gift', compute: 'instant',
  keywords: ['loot box', 'gacha', 'random drop', 'rarity'], offline: true,
};
export default manifest;
