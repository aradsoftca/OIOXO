'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-remove-numbers"
      transform={(s, o) => o.tokens
        ? s.replace(/\b-?\d+(?:[.,]\d+)?\b/g, '')
        : s.replace(/\d/g, '')}
      controls={[
        { id: 'tokens', label: 'Remove whole numeric tokens (incl. decimals)', type: 'toggle', defaultValue: false },
      ]}
    />
  );
}
