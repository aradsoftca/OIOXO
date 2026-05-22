import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-hmac',
  name: 'HMAC',
  blurb: 'Compute HMAC signatures with SHA-256/384/512 or SHA-1.',
  category: 'dev', tile: 'M', icon: 'fingerprint', compute: 'instant',
  keywords: ['hmac', 'message authentication', 'signature', 'webhook'], offline: true,
};
export default manifest;
