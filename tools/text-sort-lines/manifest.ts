import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-sort-lines',
  name: 'Sort Lines',
  blurb: 'A–Z, Z–A, by length, or numerically — case-aware.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'arrow-up-down', compute: 'instant',
  keywords: ['sort', 'order', 'alphabetize', 'natural sort'], offline: true,
};
export default manifest;
