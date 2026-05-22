import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'archive-extract',
  name: 'Extract Archive',
  blurb: 'Open ZIP, 7z, RAR, TAR, GZ, ISO and more — list the contents and pull files out, on your device.',
  category: 'convert',
  tile: 'L',
  icon: 'folder-archive',
  compute: 'local',
  accepts: ['application/zip', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-tar', 'application/gzip', 'application/x-bzip2'],
  produces: ['application/zip'],
  keywords: ['extract', 'unzip', 'open 7z', 'open rar', 'untar', 'archive extractor', 'decompress'],
  pinDefault: false,
  offline: true,
};

export default manifest;
