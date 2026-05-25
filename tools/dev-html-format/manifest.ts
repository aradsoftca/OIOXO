import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-html-format',
  name: 'HTML Formatter',
  blurb: 'Reflow HTML with consistent indent and tag-aware line breaks.',
  category: 'dev',
  accepts: ['text/*'], tile: 'M', icon: 'code', compute: 'instant',
  keywords: ['html', 'format', 'beautify', 'pretty print'], offline: true,
};
export default manifest;
