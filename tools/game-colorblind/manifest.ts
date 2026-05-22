import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-colorblind',
  name: 'Colorblind Simulator',
  blurb: 'See how your game UI looks to colorblind players — 3 vision types.',
  category: 'game', tile: 'M', icon: 'eye', compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['colorblind', 'protanopia', 'deuteranopia', 'tritanopia', 'accessibility'], offline: true,
};
export default manifest;
