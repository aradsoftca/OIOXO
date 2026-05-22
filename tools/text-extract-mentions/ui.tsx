'use client';
import { TextTool } from '@/components/tool/TextTool';
import { extract } from '@/engines/text';
export default function Tool() {
  return (
    <TextTool
      toolId="text-extract-mentions"
      transform={(s) => extract(s, 'mention').join('\n')}
    />
  );
}
