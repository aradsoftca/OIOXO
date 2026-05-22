import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-ua',
  name: 'User Agent Parser',
  blurb: 'Decode any User-Agent string — browser, engine, OS, device type.',
  category: 'ip', tile: 'M', icon: 'fingerprint', compute: 'instant',
  keywords: ['user agent', 'ua parser', 'browser detection'], offline: true,
};
export default manifest;
