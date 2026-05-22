import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'archive-zip',
  name: 'Create ZIP',
  blurb: 'Drop a pile of files and bundle them into one ZIP — instantly, on your device.',
  category: 'convert',
  tile: 'M',
  icon: 'folder-plus',
  compute: 'instant',
  produces: ['application/zip'],
  keywords: ['zip', 'create zip', 'compress files', 'make zip', 'bundle files', 'archive'],
  pinDefault: false,
  offline: true,
};

export default manifest;
