import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-remove-empty-lines',
  name: 'Remove Empty Lines',
  blurb: 'Strip blank or whitespace-only lines from any text.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'minus', compute: 'instant',
  keywords: ['remove empty', 'blank lines', 'clean'], offline: true,
};
export default manifest;
