'use client';

import { TextTool } from '@/components/tool/TextTool';

// AP-style title case: small words (a, an, the, of, etc.) stay lowercase
// unless they begin the title. Not perfect, but close enough for headings.
const SMALL = new Set([
  'a','an','and','as','at','but','by','en','for','if','in','of','on','or','the','to','vs','via',
]);

function titleCase(input: string, options: Record<string, unknown>): string {
  const everyWord = Boolean(options['everyWord']);
  return input
    .split(/\n/)
    .map((line) => {
      const words = line.split(/(\s+)/);
      let wordCount = 0;
      return words
        .map((token) => {
          if (/^\s+$/.test(token) || token === '') return token;
          wordCount += 1;
          const lower = token.toLowerCase();
          const isFirst = wordCount === 1;
          if (!isFirst && !everyWord && SMALL.has(lower)) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
    })
    .join('\n');
}

export default function TitleCaseTool() {
  return (
    <TextTool
      toolId="text-title-case"
      transform={titleCase}
      controls={[{ id: 'everyWord', label: 'Capitalize small words too', type: 'toggle', defaultValue: false }]}
      inputPlaceholder="Type or paste a heading to title-case"
    />
  );
}
