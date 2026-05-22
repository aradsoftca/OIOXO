'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';
import { parseMac } from '@/engines/net';

function compute(v: Record<string, string | number>): CalcResult[] {
  const input = String(v.mac ?? '').trim();
  if (!input) return [{ label: 'Enter a MAC address', value: '—', primary: true }];
  try {
    const m = parseMac(input);
    return [
      { label: 'Formatted', value: m.formatted, primary: true },
      { label: 'OUI',       value: m.oui },
      { label: 'Vendor',    value: m.vendor },
      { label: 'Type',      value: `${m.unicast ? 'Unicast' : 'Multicast'}  ·  ${m.universal ? 'Universal' : 'Locally administered'}` },
      { label: 'Hyphen',    value: m.formatted.replace(/:/g, '-') },
      { label: 'Bare',      value: m.formatted.replace(/:/g, '') },
    ];
  } catch (e) {
    return [{ label: 'Invalid', value: e instanceof Error ? e.message : String(e), primary: true }];
  }
}

export default function Tool() {
  return (
    <CalcTool
      toolId="net-mac"
      colorVar="--color-cat-ip"
      inputs={[
        { id: 'mac', label: 'MAC address', type: 'text', defaultValue: 'AC:DE:48:00:11:22' },
      ]}
      compute={compute}
    />
  );
}
