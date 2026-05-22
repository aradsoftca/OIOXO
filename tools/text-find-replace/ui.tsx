'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-find-replace"
      transform={(s, o) => {
        const find = String(o.find ?? '');
        if (!find) return s;
        const replace = String(o.replace ?? '');
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = (o.caseInsensitive ? 'gi' : 'g');
        return s.replace(new RegExp(escaped, flags), replace);
      }}
      controls={[
        { id: 'find',    label: 'Find',    type: 'text', defaultValue: '' },
        { id: 'replace', label: 'Replace with', type: 'text', defaultValue: '' },
        { id: 'caseInsensitive', label: 'Case-insensitive', type: 'toggle', defaultValue: false },
      ]}
    />
  );
}
