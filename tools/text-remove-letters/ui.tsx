'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-remove-letters"
      transform={(s, o) => o.asciiOnly
        ? s.replace(/[A-Za-z]/g, '')
        : s.replace(/\p{L}/gu, '')}
      controls={[
        { id: 'asciiOnly', label: 'ASCII A–Z only (keep accented letters)', type: 'toggle', defaultValue: false },
      ]}
    />
  );
}
