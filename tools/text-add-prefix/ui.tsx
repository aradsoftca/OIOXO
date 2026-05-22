'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-add-prefix"
      transform={(s, o) => {
        const p = String(o.prefix ?? '');
        const skip = Boolean(o.skipEmpty);
        return s.split(/\r?\n/).map((l) => (skip && !l.trim() ? l : p + l)).join('\n');
      }}
      controls={[
        { id: 'prefix', label: 'Prefix', type: 'text', defaultValue: '> ' },
        { id: 'skipEmpty', label: 'Skip empty lines', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
