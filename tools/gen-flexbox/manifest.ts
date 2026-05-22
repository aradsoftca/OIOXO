import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-flexbox',
  name: 'Flexbox Playground',
  blurb: 'Toggle every flex property visually — copy ready-to-paste CSS.',
  category: 'generator', tile: 'M', icon: 'columns', compute: 'instant',
  keywords: ['css', 'flexbox', 'flex', 'layout', 'align', 'justify'], offline: true,
};
export default manifest;
