import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-add-suffix',
  name: 'Add Suffix',
  blurb: 'Append a suffix to every line — punctuation, tags, anything.',
  category: 'text', tile: 'S', icon: 'plus', compute: 'instant',
  keywords: ['suffix', 'each line', 'append'], offline: true,
};
export default manifest;
