import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-grid',
  name: 'CSS Grid Playground',
  blurb: 'Build a grid visually with rows, columns, and gap — copy the CSS.',
  category: 'generator', tile: 'M', icon: 'grid', compute: 'instant',
  keywords: ['css', 'grid', 'layout', 'columns', 'rows'], offline: true,
};
export default manifest;
