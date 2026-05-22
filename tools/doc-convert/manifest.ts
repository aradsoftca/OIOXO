import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'doc-convert',
  name: 'Document Converter',
  blurb: 'Word (.docx, .doc) and OpenDocument (.odt) → PDF, web page, or plain text — on your device.',
  category: 'convert',
  tile: 'L',
  icon: 'file-text',
  compute: 'local',
  accepts: ['.docx', '.doc', '.odt'],
  produces: ['application/pdf', 'text/html', 'text/plain'],
  keywords: ['docx to pdf', 'doc to pdf', 'odt to pdf', 'word to pdf', 'word to html', 'document converter'],
  pinDefault: false,
  offline: true,
};

export default manifest;
