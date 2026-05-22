'use client';

import { TextTool } from '@/components/tool/TextTool';

function reverseText(input: string, options: Record<string, unknown>): string {
  const mode = String(options['mode'] ?? 'string');
  if (mode === 'lines') {
    return input.split('\n').reverse().join('\n');
  }
  if (mode === 'words') {
    return input.split(/(\s+)/).reverse().join('');
  }
  // string — use Array.from to handle surrogate pairs (emoji, CJK)
  return Array.from(input).reverse().join('');
}

export default function ReverseTextTool() {
  return (
    <TextTool
      toolId="text-reverse"
      transform={reverseText}
      controls={[{
        id: 'mode',
        label: 'Reverse by',
        type: 'select',
        defaultValue: 'string',
        options: [
          { value: 'string', label: 'Character (Unicode-safe)' },
          { value: 'words', label: 'Word order' },
          { value: 'lines', label: 'Line order' },
        ],
      }]}
      inputPlaceholder="Type or paste text to reverse"
    />
  );
}
