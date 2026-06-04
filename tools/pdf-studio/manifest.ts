import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-studio',
  name: 'PDF Studio',
  blurb: 'A full PDF editor in your browser — reorder, rotate, delete & duplicate pages, merge files, add text, images, redaction boxes and page numbers, then export. Nothing is uploaded.',
  category: 'pdf', tile: 'L', icon: 'file-pen', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf editor', 'edit pdf', 'organize pdf', 'reorder pages', 'rotate pdf', 'redact pdf', 'add text to pdf', 'merge pdf', 'pdf studio'],
  offline: true,
  pinDefault: true,
};
export default manifest;
