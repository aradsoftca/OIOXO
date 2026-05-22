import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-word-counter',
  name: 'Word Counter',
  blurb: 'Live word, character, line, paragraph, and reading-time counts.',
  category: 'text',
  tile: 'M',
  icon: 'tally-5',
  compute: 'instant',
  keywords: ['word counter', 'character count', 'reading time', 'lines'],
  offline: true,
  pinDefault: true,
};

export default manifest;
