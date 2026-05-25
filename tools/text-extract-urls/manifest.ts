import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-urls',
  name: 'Extract URLs',
  blurb: 'Pull every http/https link out of any text.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'link', compute: 'instant',
  keywords: ['extract urls', 'find links', 'url list'], offline: true,
};
export default manifest;
