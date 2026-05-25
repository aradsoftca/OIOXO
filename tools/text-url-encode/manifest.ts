import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-url-encode',
  name: 'URL Encode',
  blurb: 'Percent-encode any string for safe use in URLs.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'link', compute: 'instant',
  keywords: ['url encode', 'percent encode', 'escape'], offline: true,
};
export default manifest;
