import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-to-text',
  name: 'PDF to Plain Text',
  blurb: 'Pull selectable text out of any PDF — instant, on-device.',
  category: 'pdf',
  tile: 'M',
  icon: 'file-text',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['text/plain'],
  keywords: ['pdf to text', 'extract text', 'pdf text', 'plain text'],
  pinDefault: false,
  offline: true,
};

export default manifest;
