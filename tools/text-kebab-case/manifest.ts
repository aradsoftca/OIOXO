import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-kebab-case',
  name: 'kebab-case',
  blurb: 'Convert any text to kebab-case identifiers (URL-safe).',
  category: 'text', tile: 'S', icon: 'type', compute: 'instant',
  keywords: ['kebab case', 'hyphenated', 'slug', 'url safe'], offline: true,
};
export default manifest;
