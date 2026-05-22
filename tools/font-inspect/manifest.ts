import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'font-inspect',
  name: 'Font Inspector',
  blurb: 'Read every metadata field — designer, version, license, glyph count.',
  category: 'font', tile: 'M', icon: 'file-search', compute: 'local',
  accepts: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2'],
  keywords: ['font', 'inspect', 'metadata', 'designer', 'glyphs', 'license'], offline: true,
};
export default manifest;
