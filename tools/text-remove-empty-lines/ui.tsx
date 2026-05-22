'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-remove-empty-lines"
      transform={(s, o) => s.split(/\r?\n/).filter((l) =>
        o.trim ? l.trim().length > 0 : l.length > 0,
      ).join('\n')}
      controls={[
        { id: 'trim', label: 'Treat whitespace-only as empty', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
