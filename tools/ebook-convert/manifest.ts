import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'ebook-convert',
  name: 'EPUB Converter',
  blurb: 'Turn an EPUB into a PDF, web page, or plain text — read it anywhere, on your device.',
  category: 'convert',
  tile: 'L',
  icon: 'book-open',
  compute: 'local',
  accepts: ['application/epub+zip', '.epub'],
  produces: ['application/pdf', 'text/html', 'text/plain'],
  keywords: ['epub to pdf', 'epub converter', 'epub to text', 'ebook converter', 'epub to html'],
  pinDefault: false,
  offline: true,
};

export default manifest;
