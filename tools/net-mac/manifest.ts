import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-mac',
  name: 'MAC Lookup',
  blurb: 'Validate any MAC address — show vendor (OUI), unicast/multicast bits.',
  category: 'ip', tile: 'M', icon: 'wifi', compute: 'instant',
  keywords: ['mac address', 'oui', 'vendor lookup', 'ethernet'], offline: true,
};
export default manifest;
