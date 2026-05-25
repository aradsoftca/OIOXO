import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-reverse',
  name: 'Reverse Text',
  blurb: 'Reverse a string, line, or paragraph — Unicode-safe.',
  category: 'text',
  accepts: ['text/*'],
  tile: 'S',
  icon: 'flip-horizontal',
  compute: 'instant',
  keywords: ['reverse', 'mirror', 'text'],
  offline: true,
};

export default manifest;
