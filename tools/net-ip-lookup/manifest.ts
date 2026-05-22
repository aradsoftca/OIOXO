import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-ip-lookup',
  name: 'IP Lookup',
  blurb: 'Look up any IP address or domain — location, ISP, ASN and timezone.',
  category: 'ip', tile: 'M', icon: 'search', compute: 'instant',
  keywords: ['ip lookup', 'ip address', 'geolocation', 'asn', 'isp', 'domain', 'whereis'],
  offline: false,
};
export default manifest;
