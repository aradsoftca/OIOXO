import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-password',
  name: 'Password Generator',
  blurb: 'Strong random passwords with custom length and character sets.',
  category: 'dev',
  accepts: ['text/*'], tile: 'M', icon: 'lock', compute: 'instant',
  keywords: ['password generator', 'random password', 'secure', 'strong'], offline: true,
};
export default manifest;
