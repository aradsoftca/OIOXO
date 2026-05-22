import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-bcrypt',
  name: 'Bcrypt',
  blurb: 'Hash a password with bcrypt — or verify a stored hash.',
  category: 'dev', tile: 'M', icon: 'lock', compute: 'instant',
  keywords: ['bcrypt', 'password hash', 'verify', 'salt'], offline: true,
};
export default manifest;
