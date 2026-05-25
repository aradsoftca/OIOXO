import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-url-decode',
  name: 'URL Decode',
  blurb: 'Decode percent-encoded URLs back to plain text.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'link', compute: 'instant',
  keywords: ['url decode', 'percent decode', 'unescape'], offline: true,
};
export default manifest;
