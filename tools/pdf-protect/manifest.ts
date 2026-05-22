import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-protect',
  name: 'Protect PDF',
  blurb: 'Add a password and set permissions on a PDF — all on your device.',
  category: 'pdf',
  tile: 'M',
  icon: 'lock',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['protect pdf', 'password pdf', 'encrypt pdf', 'lock pdf', 'pdf permissions'],
  pinDefault: false,
  offline: true,
};

export default manifest;
