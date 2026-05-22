import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-yaml-to-json',
  name: 'YAML → JSON',
  blurb: 'Convert YAML to formatted JSON.',
  category: 'dev', tile: 'S', icon: 'arrow-left', compute: 'instant',
  keywords: ['yaml to json', 'convert json', 'config'], offline: true,
};
export default manifest;
