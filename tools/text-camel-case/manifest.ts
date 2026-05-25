import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-camel-case',
  name: 'camelCase',
  blurb: 'Convert any text to camelCase identifiers.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'type', compute: 'instant',
  keywords: ['camelcase', 'identifier', 'variable name'], offline: true,
};
export default manifest;
