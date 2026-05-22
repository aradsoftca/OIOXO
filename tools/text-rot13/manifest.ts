import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-rot13',
  name: 'ROT13',
  blurb: 'Classic letter substitution cipher — encode and decode are the same.',
  category: 'text', tile: 'S', icon: 'shuffle', compute: 'instant',
  keywords: ['rot13', 'cipher', 'caesar', 'obfuscate'], offline: true,
};
export default manifest;
