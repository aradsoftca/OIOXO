import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-readability',
  name: 'Readability Score',
  blurb: 'Flesch reading-ease score with target audience for any passage.',
  category: 'text', tile: 'M', icon: 'book-open', compute: 'instant',
  keywords: ['readability', 'flesch', 'reading ease', 'grade level'], offline: true,
};
export default manifest;
