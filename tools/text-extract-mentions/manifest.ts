import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-mentions',
  name: 'Extract Mentions',
  blurb: 'Pull every @mention out of any text — deduped.',
  category: 'text', tile: 'S', icon: 'at-sign', compute: 'instant',
  keywords: ['extract mentions', 'social media', '@handles'], offline: true,
};
export default manifest;
