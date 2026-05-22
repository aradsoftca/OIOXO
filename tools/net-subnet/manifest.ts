import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-subnet',
  name: 'Subnet Calculator',
  blurb: 'Split any network into N equal subnets — see each new range.',
  category: 'ip', tile: 'M', icon: 'split', compute: 'instant',
  keywords: ['subnet', 'subnetting', 'vlsm', 'subdivide network'], offline: true,
};
export default manifest;
