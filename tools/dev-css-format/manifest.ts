import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-css-format',
  name: 'CSS Formatter',
  blurb: 'Tidy CSS or SCSS — one declaration per line, consistent indent, no clutter.',
  category: 'dev',
  accepts: ['text/*'], tile: 'M', icon: 'code', compute: 'instant',
  keywords: ['css', 'format', 'beautify', 'pretty print', 'scss'], offline: true,
};
export default manifest;
