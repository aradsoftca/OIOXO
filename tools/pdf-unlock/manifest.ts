import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-unlock',
  name: 'Unlock PDF',
  blurb: 'Remove the password from a PDF you can open — saves an unprotected copy.',
  category: 'pdf',
  tile: 'M',
  icon: 'lock-open',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['unlock pdf', 'remove password', 'decrypt pdf', 'unprotect pdf', 'pdf password remover'],
  pinDefault: false,
  offline: true,
};

export default manifest;
