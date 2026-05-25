import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-add-prefix',
  name: 'Add Prefix',
  blurb: 'Add a prefix to every line — bullet points, comments, anything.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'plus', compute: 'instant',
  keywords: ['prefix', 'each line', 'comment', 'bullet'], offline: true,
};
export default manifest;
