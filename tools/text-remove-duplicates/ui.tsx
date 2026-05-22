'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-remove-duplicates"
      transform={(s, o) => {
        const ci = Boolean(o.caseInsensitive);
        const trim = Boolean(o.trim);
        const seen = new Set<string>();
        return s.split(/\r?\n/).filter((l) => {
          const k = (trim ? l.trim() : l);
          const key = ci ? k.toLowerCase() : k;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).join('\n');
      }}
      controls={[
        { id: 'caseInsensitive', label: 'Case-insensitive', type: 'toggle', defaultValue: false },
        { id: 'trim',            label: 'Ignore leading/trailing space', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
