import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-sensitivity',
  name: 'Sensitivity Converter',
  blurb: 'Move your aim between Valorant, CS, Apex, Overwatch, and more.',
  category: 'game', tile: 'M', icon: 'crosshair', compute: 'instant',
  keywords: ['sensitivity converter', 'valorant', 'cs2', 'apex', 'overwatch'], offline: true,
};
export default manifest;
