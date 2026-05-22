import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-cleaner',
  name: 'Clean & Normalize',
  blurb: 'Strip music notes, normalize quotes, fix common subtitle clutter.',
  category: 'subtitle', tile: 'M', icon: 'broom', compute: 'instant',
  keywords: ['subtitle clean', 'normalize', 'strip tags', 'ssa', 'ass'], offline: true,
};
export default manifest;
