import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-ports',
  name: 'Port Checker',
  blurb: 'Check whether common ports accept TCP connections on a host.',
  category: 'ip', tile: 'M', icon: 'plug', compute: 'instant',
  keywords: ['port', 'open port', 'tcp', 'port checker', 'firewall', 'service'],
  offline: false,
};
export default manifest;
