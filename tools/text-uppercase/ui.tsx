'use client';

import { TextTool } from '@/components/tool/TextTool';

export default function UppercaseTool() {
  return (
    <TextTool
      toolId="text-uppercase"
      transform={(input) => input.toUpperCase()}
      inputPlaceholder="Type or paste text to UPPERCASE"
    />
  );
}
