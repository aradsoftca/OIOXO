import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'net-speed-test',
  name: 'Internet Speed Test',
  blurb: 'Measure your download, upload and latency — runs against our own server.',
  category: 'ip',
  tile: 'L',
  icon: 'gauge',
  compute: 'instant',
  keywords: ['speed test', 'internet speed', 'bandwidth test', 'download speed', 'upload speed', 'ping test'],
  pinDefault: true,
  offline: false,
};

export default manifest;
