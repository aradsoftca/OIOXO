import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'net-ping',
  name: 'Ping (Latency)',
  blurb: 'Measure round-trip latency to a host over TCP — min, average and max.',
  category: 'ip', tile: 'M', icon: 'activity', compute: 'instant',
  keywords: ['ping', 'latency', 'rtt', 'response time', 'reachable', 'tcp'],
  offline: false,
};
export default manifest;
