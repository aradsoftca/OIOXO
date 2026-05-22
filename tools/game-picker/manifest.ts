import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-picker',
  name: 'Random Picker',
  blurb: 'Drop a list of options, get a random pick — or shuffle the whole thing.',
  category: 'game', tile: 'M', icon: 'shuffle', compute: 'instant',
  keywords: ['random picker', 'shuffle', 'pick one', 'team draw'], offline: true,
};
export default manifest;
