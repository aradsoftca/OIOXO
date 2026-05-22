import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'net-dns',
  name: 'DNS Lookup',
  blurb: 'Look up A, AAAA, MX, TXT, NS and more for any domain — straight from your browser.',
  category: 'ip',
  tile: 'M',
  icon: 'globe',
  compute: 'instant',
  keywords: ['dns lookup', 'dns records', 'mx record', 'txt record', 'nameserver', 'a record', 'cname'],
  pinDefault: false,
  offline: false,
};

export default manifest;
