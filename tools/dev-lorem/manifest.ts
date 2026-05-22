import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-lorem',
  name: 'Lorem Ipsum',
  blurb: 'Generate placeholder text — words, sentences, or paragraphs.',
  category: 'dev',
  tile: 'S',
  icon: 'pilcrow',
  compute: 'instant',
  keywords: ['lorem', 'ipsum', 'placeholder', 'dummy text'],
  offline: true,
};

export default manifest;
