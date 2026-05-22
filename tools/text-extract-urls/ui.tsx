'use client';
import { TextTool } from '@/components/tool/TextTool';
import { extract } from '@/engines/text';
export default function Tool() {
  return (
    <TextTool
      toolId="text-extract-urls"
      transform={(s, o) => extract(s, 'url', !o.allowDuplicates).join('\n')}
      controls={[
        { id: 'allowDuplicates', label: 'Keep duplicates', type: 'toggle', defaultValue: false },
      ]}
    />
  );
}
