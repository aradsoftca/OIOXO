import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'office-docs',
  name: 'Docs Studio',
  blurb: 'Pro word processor in your browser — headings, lists, tables, images, find & replace, comments, export Markdown/HTML/PDF.',
  category: 'text', tile: 'L', icon: 'file-text', compute: 'local',
  accepts: ['text/plain', 'text/markdown', 'text/html'],
  produces: ['text/markdown', 'text/html', 'application/pdf'],
  keywords: ['word processor', 'document editor', 'docs', 'markdown editor', 'rich text', 'office docs', 'writing app', 'wysiwyg'],
  offline: true,
  pinDefault: true,
};
export default manifest;
