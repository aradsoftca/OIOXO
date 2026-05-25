import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-add-line-numbers',
  name: 'Add Line Numbers',
  blurb: 'Number every line — 1, 2, 3 — with custom format and padding.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'list-ordered', compute: 'instant',
  keywords: ['line numbers', 'numbered list', 'enumerate'], offline: true,
};
export default manifest;
