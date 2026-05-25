import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-sentence-case',
  name: 'Sentence case',
  blurb: 'Capitalize the first letter of every sentence — instant.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'type', compute: 'instant',
  keywords: ['sentence case', 'capitalize first letter'], offline: true,
};
export default manifest;
