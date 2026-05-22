'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-reverse-lines"
      transform={(s) => s.split(/\r?\n/).reverse().join('\n')}
    />
  );
}
