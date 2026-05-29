'use client';
import { TextTool } from '@/components/tool/TextTool';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-regex"
      colorVar="--color-cat-dev"
      inputPlaceholder="Paste the text to search…"
      transform={(input, opts) => {
        const pattern = String(opts.pattern ?? '');
        const flags = String(opts.flags ?? 'g');
        if (!pattern) return 'Enter a pattern in the panel on the right.';
        try {
          const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
          const matches: Array<{ index: number; match: string; groups: string[] }> = [];
          let m: RegExpExecArray | null;
          // Cap iterations: a zero-width match against a long input can loop
          // pathologically even with the lastIndex bump below, and rendering
          // 100k+ matches would freeze the textarea anyway.
          const LIMIT = 10_000;
          let truncated = false;
          while ((m = re.exec(input)) !== null) {
            matches.push({ index: m.index, match: m[0], groups: m.slice(1) });
            if (m.index === re.lastIndex) re.lastIndex++;
            if (matches.length >= LIMIT) { truncated = true; break; }
          }
          if (matches.length === 0) return 'No matches.';
          const lines = [
            `${matches.length} match${matches.length === 1 ? '' : 'es'}${truncated ? ` (stopped at ${LIMIT.toLocaleString()})` : ''}`,
            '',
            ...matches.map((m, i) => {
              const groups = m.groups.length
                ? '\n   ' + m.groups.map((g, j) => `[${j + 1}] ${g ?? '(undefined)'}`).join('\n   ')
                : '';
              return `${String(i + 1).padStart(3)}. @${m.index}  ${m.match}${groups}`;
            }),
          ];
          return lines.join('\n');
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        { id: 'pattern', label: 'Pattern', type: 'text', defaultValue: '\\b\\w+@\\w+\\.\\w+\\b' },
        { id: 'flags',   label: 'Flags',   type: 'text', defaultValue: 'gi' },
      ]}
    />
  );
}
