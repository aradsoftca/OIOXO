import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'finance-currency',
  name: 'Currency Converter',
  blurb: 'Convert between 30+ currencies with daily European Central Bank rates.',
  category: 'finance',
  tile: 'L',
  icon: 'banknote',
  compute: 'instant',
  keywords: ['currency converter', 'exchange rate', 'usd to eur', 'convert currency', 'forex', 'money converter'],
  pinDefault: true,
  offline: false,
};

export default manifest;
