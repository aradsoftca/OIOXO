import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-headers',
  name: 'HTTP Header Inspector',
  blurb: 'Paste raw HTTP headers — get a clean structured view + security report.',
  category: 'ip', tile: 'M', icon: 'list', compute: 'instant',
  keywords: ['http headers', 'security headers', 'hsts', 'csp', 'cors'], offline: true,
};
export default manifest;
