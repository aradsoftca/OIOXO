import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-slug',
  name: 'Slug Generator',
  blurb: 'Turn a title into a clean URL slug — Unicode-safe transliteration.',
  category: 'dev',
  tile: 'S',
  icon: 'link',
  compute: 'instant',
  keywords: ['slug', 'url', 'kebab-case', 'permalink'],
  offline: true,
};

export default manifest;
