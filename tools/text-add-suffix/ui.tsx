'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-add-suffix"
      transform={(s, o) => {
        const x = String(o.suffix ?? '');
        const skip = Boolean(o.skipEmpty);
        return s.split(/\r?\n/).map((l) => (skip && !l.trim() ? l : l + x)).join('\n');
      }}
      controls={[
        { id: 'suffix', label: 'Suffix', type: 'text', defaultValue: ',' },
        { id: 'skipEmpty', label: 'Skip empty lines', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
