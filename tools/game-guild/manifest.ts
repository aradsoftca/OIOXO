import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-guild',
  name: 'Guild Name',
  blurb: 'Names for MMO guilds, orders, and brotherhoods.',
  category: 'game', tile: 'M', icon: 'flag', compute: 'instant',
  keywords: ['guild name', 'mmo', 'brotherhood', 'order'], offline: true,
};
export default manifest;
