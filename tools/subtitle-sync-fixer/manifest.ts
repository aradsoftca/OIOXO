import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-sync-fixer',
  name: 'Sync Fixer',
  blurb: 'Align subtitle timings — shift, stretch, or anchor on two known points.',
  category: 'subtitle', tile: 'M', icon: 'sliders-horizontal', compute: 'instant',
  keywords: ['subtitle sync', 'align', 'drift', 'stretch'], offline: true,
};
export default manifest;
