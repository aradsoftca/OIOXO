import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-random-data',
  name: 'Random Data',
  blurb: 'Fake names, emails, addresses, companies — perfect for testing.',
  category: 'generator', tile: 'M', icon: 'shuffle', compute: 'instant',
  keywords: ['random data', 'fake data', 'mock', 'test data', 'lorem'], offline: true,
};
export default manifest;
