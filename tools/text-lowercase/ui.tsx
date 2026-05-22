'use client';

import { TextTool } from '@/components/tool/TextTool';

export default function LowercaseTool() {
  return (
    <TextTool
      toolId="text-lowercase"
      transform={(input) => input.toLowerCase()}
      inputPlaceholder="Type or paste text to lowercase"
    />
  );
}
