import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-xp',
  name: 'XP Calculator',
  blurb: 'How long to grind from level A to level B — given an XP curve.',
  category: 'game', tile: 'M', icon: 'trending-up', compute: 'instant',
  keywords: ['xp', 'leveling', 'grind', 'experience'], offline: true,
};
export default manifest;
