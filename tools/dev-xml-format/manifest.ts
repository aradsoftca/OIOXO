import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-xml-format',
  name: 'XML Formatter',
  blurb: 'Pretty-print XML / HTML with proper nesting.',
  category: 'dev', tile: 'S', icon: 'code-2', compute: 'instant',
  keywords: ['xml format', 'pretty print', 'html format', 'beautify'], offline: true,
};
export default manifest;
