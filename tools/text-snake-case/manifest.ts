import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-snake-case',
  name: 'snake_case',
  blurb: 'Convert any text to snake_case identifiers.',
  category: 'text', tile: 'S', icon: 'type', compute: 'instant',
  keywords: ['snake case', 'underscore', 'identifier'], offline: true,
};
export default manifest;
