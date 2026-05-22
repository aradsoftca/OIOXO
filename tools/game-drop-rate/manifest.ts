import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-drop-rate',
  name: 'Drop Rate Calculator',
  blurb: 'Given a drop chance, find your odds over N attempts and how many tries you really need.',
  category: 'game', tile: 'M', icon: 'percent', compute: 'instant',
  keywords: ['drop rate', 'probability', 'odds', 'rng', 'farm', 'chance'], offline: true,
};
export default manifest;
