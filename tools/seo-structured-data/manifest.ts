import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-structured-data',
  name: 'Structured Data',
  blurb: 'Generate Schema.org JSON-LD for Organization, Article, Product, FAQ, and more.',
  category: 'seo', tile: 'M', icon: 'database', compute: 'instant',
  keywords: ['schema.org', 'json-ld', 'structured data', 'rich snippets'], offline: true,
};
export default manifest;
