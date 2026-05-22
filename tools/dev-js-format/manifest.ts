import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-js-format',
  name: 'JavaScript Formatter',
  blurb: 'Pretty-print or minify JS/TS — consistent indent, smart line breaks.',
  category: 'dev', tile: 'M', icon: 'code', compute: 'instant',
  keywords: ['javascript', 'js', 'format', 'beautify', 'minify', 'typescript'], offline: true,
};
export default manifest;
