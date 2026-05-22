import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-name',
  name: 'Gaming Name',
  blurb: 'Pro-style gaming names — prefix, base, suffix combos.',
  category: 'game', tile: 'M', icon: 'gamepad-2', compute: 'instant',
  keywords: ['gaming name', 'esports', 'pro name'], offline: true,
};
export default manifest;
