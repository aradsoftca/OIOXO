import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-jwt-decode',
  name: 'JWT Decoder',
  blurb: 'Inspect a JSON Web Token — header and payload, decoded.',
  category: 'dev', tile: 'M', icon: 'key', compute: 'instant',
  keywords: ['jwt decode', 'json web token', 'inspect token', 'auth'], offline: true,
};
export default manifest;
