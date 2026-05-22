import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-dpi',
  name: 'eDPI Calculator',
  blurb: 'Effective DPI = mouse DPI × in-game sensitivity. The standard ranking.',
  category: 'game', tile: 'M', icon: 'mouse-pointer', compute: 'instant',
  keywords: ['edpi', 'dpi', 'mouse sensitivity', 'fps gaming'], offline: true,
};
export default manifest;
