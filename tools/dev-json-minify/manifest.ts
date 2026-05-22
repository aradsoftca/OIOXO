import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-json-minify',
  name: 'JSON Minify',
  blurb: 'Strip whitespace from JSON — smallest valid output.',
  category: 'dev', tile: 'S', icon: 'code-2', compute: 'instant',
  keywords: ['json minify', 'compact json', 'strip whitespace'], offline: true,
};
export default manifest;
