import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-find-replace',
  name: 'Find & Replace',
  blurb: 'Plain-text find and replace with case-insensitive toggle.',
  category: 'text',
  accepts: ['text/*'], tile: 'M', icon: 'replace', compute: 'instant',
  keywords: ['find replace', 'substitute', 'swap'], offline: true,
};
export default manifest;
