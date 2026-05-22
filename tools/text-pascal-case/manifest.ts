import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-pascal-case',
  name: 'PascalCase',
  blurb: 'Convert any text to PascalCase identifiers.',
  category: 'text', tile: 'S', icon: 'type', compute: 'instant',
  keywords: ['pascalcase', 'class name', 'identifier'], offline: true,
};
export default manifest;
