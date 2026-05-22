'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parseCidr, numberToIp4, ip4ToNumber } from '@/engines/net';

export default function Tool() {
  return (
    <TextTool
      toolId="net-subnet"
      colorVar="--color-cat-ip"
      initialInput=" "
      transform={(_, o) => {
        const cidr = String(o.cidr ?? '').trim();
        if (!cidr) return 'Enter a parent network (e.g. 10.0.0.0/16).';
        try {
          const parent = parseCidr(cidr);
          const targetPrefix = Math.max(parent.prefix, Math.min(32, Number(o.newPrefix) || parent.prefix + 2));
          if (targetPrefix < parent.prefix) return 'New prefix must be greater than parent.';
          const subnetsCount = Math.pow(2, targetPrefix - parent.prefix);
          if (subnetsCount > 4096) return `Too many subnets (${subnetsCount.toLocaleString()}) — pick a smaller new prefix.`;
          const blockSize = Math.pow(2, 32 - targetPrefix);
          const base = ip4ToNumber(parent.network);

          const rows: string[] = [];
          rows.push(`Parent: ${parent.network}/${parent.prefix}  →  ${subnetsCount.toLocaleString()} subnets of /${targetPrefix}`);
          rows.push(`Each holds ${(blockSize - 2 > 0 ? blockSize - 2 : blockSize).toLocaleString()} usable hosts.`);
          rows.push('');
          rows.push('#     Network          Broadcast        First → Last hosts');
          rows.push('─'.repeat(70));
          for (let i = 0; i < subnetsCount; i++) {
            const net = base + i * blockSize;
            const bcast = net + blockSize - 1;
            const first = blockSize >= 4 ? net + 1 : net;
            const last  = blockSize >= 4 ? bcast - 1 : bcast;
            rows.push(
              `${String(i + 1).padStart(4)}  ${numberToIp4(net).padEnd(16)} ${numberToIp4(bcast).padEnd(16)} ${numberToIp4(first).padEnd(15)} → ${numberToIp4(last)}`,
            );
          }
          return rows.join('\n');
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        { id: 'cidr',      label: 'Parent network', type: 'text',   defaultValue: '10.0.0.0/22' },
        { id: 'newPrefix', label: 'New prefix /N',  type: 'number', defaultValue: 24, min: 0, max: 32 },
      ]}
    />
  );
}
