import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-totp',
  name: 'TOTP Generator',
  blurb: 'Generate two-factor codes from a base32 secret — live countdown.',
  category: 'dev', tile: 'M', icon: 'clock', compute: 'instant',
  keywords: ['totp', '2fa', 'two-factor', 'authenticator', 'one-time password'], offline: true,
};
export default manifest;
