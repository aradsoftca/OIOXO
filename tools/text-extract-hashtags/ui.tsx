'use client';
import { TextTool } from '@/components/tool/TextTool';
import { extract } from '@/engines/text';
export default function Tool() {
  return (
    <TextTool
      toolId="text-extract-hashtags"
      transform={(s) => extract(s, 'hashtag').join('\n')}
    />
  );
}
