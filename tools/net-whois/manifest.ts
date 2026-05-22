import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'net-whois',
  name: 'Domain Lookup',
  blurb: 'See a domain’s registrar, key dates, nameservers and status — no signup.',
  category: 'ip',
  tile: 'M',
  icon: 'globe-lock',
  compute: 'instant',
  keywords: ['whois', 'domain lookup', 'rdap', 'registrar', 'domain expiry', 'domain age'],
  pinDefault: false,
  offline: false,
};

export default manifest;
