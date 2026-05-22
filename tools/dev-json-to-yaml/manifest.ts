import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-json-to-yaml',
  name: 'JSON → YAML',
  blurb: 'Convert JSON to clean YAML with proper indentation.',
  category: 'dev', tile: 'S', icon: 'arrow-right', compute: 'instant',
  keywords: ['json to yaml', 'convert yaml', 'config'], offline: true,
};
export default manifest;
