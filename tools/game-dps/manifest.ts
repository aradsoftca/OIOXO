import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-dps',
  name: 'DPS Calculator',
  blurb: 'Damage per second from base damage, fire rate, and crit chance.',
  category: 'game', tile: 'M', icon: 'flame', compute: 'instant',
  keywords: ['dps', 'damage per second', 'crit', 'rpg stats'], offline: true,
};
export default manifest;
