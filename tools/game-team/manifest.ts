import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-team',
  name: 'Team Name',
  blurb: 'Catchy team names — Mighty Wolves, Velvet Vipers, Atomic Aces.',
  category: 'game', tile: 'M', icon: 'users', compute: 'instant',
  keywords: ['team name', 'sports', 'esports'], offline: true,
};
export default manifest;
