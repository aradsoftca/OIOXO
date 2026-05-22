import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'net-my-ip',
  name: 'My IP Address',
  blurb: 'See your public IP, rough location and connection details — instantly.',
  category: 'ip',
  tile: 'M',
  icon: 'map-pin',
  compute: 'instant',
  keywords: ['my ip', 'what is my ip', 'public ip', 'ip address', 'ip geolocation', 'isp'],
  pinDefault: false,
  offline: false,
};

export default manifest;
