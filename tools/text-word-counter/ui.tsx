'use client';

import { TextTool } from '@/components/tool/TextTool';

export default function WordCounterTool() {
  return (
    <TextTool
      toolId="text-word-counter"
      transform={(input) => input}
      inputPlaceholder="Paste text to count words, characters, and reading time"
      stats={(input) => {
        const chars = input.length;
        const charsNoSpace = input.replace(/\s/g, '').length;
        const words = input.trim() ? input.trim().split(/\s+/).length : 0;
        const lines = input ? input.split(/\r?\n/).length : 0;
        const paragraphs = input.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
        const sentences = (input.match(/[.!?]+/g) ?? []).length;
        // 200wpm — middle of the 180-260 range for adult readers
        const readMinutes = Math.max(1, Math.round(words / 200));
        const speakMinutes = Math.max(1, Math.round(words / 130));

        return (
          <div className="grid gap-2 font-mono text-[12px] tabular-nums">
            <StatLine label="Characters" value={chars} />
            <StatLine label="No spaces" value={charsNoSpace} />
            <StatLine label="Words" value={words} />
            <StatLine label="Sentences" value={sentences} />
            <StatLine label="Paragraphs" value={paragraphs} />
            <StatLine label="Lines" value={lines} />
            <div className="my-1 h-px bg-black/[0.08]" />
            <StatLine label="Reading time" value={`${readMinutes} min`} />
            <StatLine label="Speaking time" value={`${speakMinutes} min`} />
          </div>
        );
      }}
    />
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-semibold text-[var(--color-fg)]">{value}</span>
    </div>
  );
}
