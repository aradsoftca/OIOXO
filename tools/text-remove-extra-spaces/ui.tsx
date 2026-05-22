'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-remove-extra-spaces"
      transform={(s, o) => {
        const lines = s.split(/\r?\n/).map((l) => {
          let out = l;
          if (o.collapseSpaces) out = out.replace(/[ \t]+/g, ' ');
          if (o.trim) out = out.trim();
          return out;
        });
        return lines.join('\n');
      }}
      controls={[
        { id: 'collapseSpaces', label: 'Collapse runs to single space', type: 'toggle', defaultValue: true },
        { id: 'trim',           label: 'Trim each line',               type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
