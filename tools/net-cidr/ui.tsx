'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';
import { parseCidr } from '@/engines/net';

function compute(v: Record<string, string | number>): CalcResult[] {
  const input = String(v.cidr ?? '').trim();
  if (!input) return [{ label: 'Enter a CIDR', value: '—', primary: true }];
  try {
    const c = parseCidr(input);
    return [
      { label: 'Network range', value: `${c.firstHost} – ${c.lastHost}`, primary: true,
        hint: `${c.usableHosts.toLocaleString()} usable host${c.usableHosts === 1 ? '' : 's'} · /${c.prefix}` },
      { label: 'Network address', value: c.network },
      { label: 'Broadcast',       value: c.broadcast },
      { label: 'Subnet mask',     value: `${c.mask}  (/${c.prefix})` },
      { label: 'Wildcard',        value: c.wildcard },
      { label: 'Total addresses', value: c.hostCount.toLocaleString() },
      { label: 'Class · scope',   value: `${c.classLetter} · ${c.isPrivate ? 'Private (RFC 1918)' : 'Public'}` },
      { label: 'Binary',          value: c.binary },
    ];
  } catch (e) {
    return [{ label: 'Invalid', value: e instanceof Error ? e.message : String(e), primary: true }];
  }
}

export default function Tool() {
  return (
    <CalcTool
      toolId="net-cidr"
      colorVar="--color-cat-ip"
      inputs={[
        { id: 'cidr', label: 'CIDR notation', type: 'text', defaultValue: '192.168.1.0/24' },
      ]}
      compute={compute}
    />
  );
}
