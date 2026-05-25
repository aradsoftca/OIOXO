import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-hashtags',
  name: 'Extract Hashtags',
  blurb: 'Pull every #hashtag out of any text — deduped.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'hash', compute: 'instant',
  keywords: ['extract hashtags', 'social media', 'tags'], offline: true,
};
export default manifest;
