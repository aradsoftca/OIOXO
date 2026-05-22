import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-gacha',
  name: 'Gacha Simulator',
  blurb: 'Simulate gacha pulls with rate and pity — see hits, effective rate and dry streaks.',
  category: 'game', tile: 'M', icon: 'gem', compute: 'instant',
  keywords: ['gacha', 'pull', 'pity', 'rate', 'simulator', 'loot box'], offline: true,
};
export default manifest;
