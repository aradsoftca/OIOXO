import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-clan',
  name: 'Clan Name',
  blurb: 'Clan tags and full clan names — 3–4 letter codes plus longform.',
  category: 'game', tile: 'M', icon: 'shield', compute: 'instant',
  keywords: ['clan name', 'clan tag', 'esports'], offline: true,
};
export default manifest;
