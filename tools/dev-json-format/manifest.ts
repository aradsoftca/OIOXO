import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-json-format',
  name: 'JSON Formatter',
  blurb: 'Format, minify, and validate JSON. Drag a file or paste a blob.',
  category: 'dev',
  tile: 'M',
  icon: 'braces',
  compute: 'instant',
  accepts: ['application/json'],
  keywords: ['json', 'format', 'pretty', 'minify', 'validate'],
  offline: true,
  pinDefault: true,
};

export default manifest;
