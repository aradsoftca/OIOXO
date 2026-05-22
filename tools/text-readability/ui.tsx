'use client';
import { TextTool } from '@/components/tool/TextTool';
import { readability } from '@/engines/text';

export default function Tool() {
  return (
    <TextTool
      toolId="text-readability"
      transform={(s) => {
        if (!s.trim()) return 'Paste a passage to score.';
        const { score, grade } = readability(s);
        const words = (s.match(/\b[\w']+\b/g) ?? []).length;
        const sentences = (s.match(/[.!?]+/g) ?? []).length;
        const avg = sentences ? (words / sentences).toFixed(1) : '—';
        return [
          `Flesch reading-ease score: ${score}`,
          `Target audience: ${grade}`,
          '',
          `Words: ${words}`,
          `Sentences: ${sentences}`,
          `Avg words per sentence: ${avg}`,
        ].join('\n');
      }}
    />
  );
}
