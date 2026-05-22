'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-regex"
      transform={(s, o) => {
        const pattern = String(o.pattern ?? '');
        if (!pattern) return s;
        const flags = String(o.flags ?? 'g');
        try {
          return s.replace(new RegExp(pattern, flags), String(o.replace ?? ''));
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }}
      controls={[
        { id: 'pattern', label: 'Pattern', type: 'text', defaultValue: '' },
        { id: 'flags',   label: 'Flags',   type: 'text', defaultValue: 'g' },
        { id: 'replace', label: 'Replacement (supports $1, $2…)', type: 'text', defaultValue: '' },
      ]}
    />
  );
}
