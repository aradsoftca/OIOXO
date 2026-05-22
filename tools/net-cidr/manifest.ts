import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-cidr',
  name: 'CIDR Calculator',
  blurb: 'Inspect any CIDR block — network, broadcast, hosts, mask, and binary.',
  category: 'ip', tile: 'M', icon: 'network', compute: 'instant',
  keywords: ['cidr', 'subnet', 'netmask', 'broadcast', 'network address'], offline: true,
};
export default manifest;
