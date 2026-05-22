import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-ocr',
  name: 'PDF to Text',
  blurb: 'Read text out of any PDF — even scanned pages. 20 languages, no upload.',
  category: 'pdf',
  tile: 'L',
  icon: 'file-search',
  compute: 'webgpu',
  accepts: ['application/pdf'],
  produces: ['text/plain'],
  keywords: ['pdf ocr', 'pdf to text', 'scanned pdf', 'extract text from pdf', 'searchable pdf', 'recognize'],
  pinDefault: true,
  offline: true,
};

export default manifest;
