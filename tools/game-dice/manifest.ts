import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-dice',
  name: 'Dice Roller',
  blurb: 'Roll any dice notation — 3d6+2, 4d10, even d100 — with crits.',
  category: 'game', tile: 'M', icon: 'dices', compute: 'instant',
  keywords: ['dice', 'd20', 'dnd', 'tabletop', 'roll'], offline: true,
};
export default manifest;
