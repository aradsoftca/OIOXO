import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-ssl',
  name: 'SSL Checker',
  blurb: 'Inspect any site’s TLS certificate — issuer, expiry, SANs and chain.',
  category: 'ip', tile: 'M', icon: 'lock', compute: 'instant',
  keywords: ['ssl', 'tls', 'certificate', 'cert', 'expiry', 'https', 'chain'],
  offline: false,
};
export default manifest;
