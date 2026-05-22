import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-add-line-breaks',
  name: 'Add Line Breaks',
  blurb: 'Wrap text at a given column or insert line breaks every N words.',
  category: 'text', tile: 'S', icon: 'corner-down-left', compute: 'instant',
  keywords: ['line break', 'word wrap', 'break lines', 'wrap'], offline: true,
};
export default manifest;
