'use client';
import { TextTool } from '@/components/tool/TextTool';

const STOP = new Set('a an the of in on at to for from with by and or but if then else is am are was were be been being have has had do does did will would shall should can could may might must this that these those i you he she it we they me him her us them my your his its our their not no yes so as it\'s that\'s'.split(/\s+/));

export default function Tool() {
  return (
    <TextTool
      toolId="text-keyword-density"
      transform={(s, o) => {
        const minLen = Number(o.minLength) || 1;
        const filterStop = Boolean(o.filterStop);
        const top = Number(o.top) || 30;
        const tokens = (s.toLowerCase().match(/\b[\p{L}'-]+\b/gu) ?? [])
          .filter((w) => w.length >= minLen && (!filterStop || !STOP.has(w)));
        const total = tokens.length || 1;
        const counts = new Map<string, number>();
        for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
        const rows = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, top);
        const pad = Math.max(...rows.map((r) => r[0].length), 4);
        const header = `${'WORD'.padEnd(pad)}  COUNT   %\n${'─'.repeat(pad + 12)}`;
        const body = rows.map(([w, c]) =>
          `${w.padEnd(pad)}  ${String(c).padStart(5)}  ${((c / total) * 100).toFixed(2)}%`,
        ).join('\n');
        return `${header}\n${body}\n\nTotal words: ${total}`;
      }}
      controls={[
        { id: 'top',        label: 'Top N',           type: 'number', defaultValue: 30, min: 5, max: 200 },
        { id: 'minLength',  label: 'Min word length', type: 'number', defaultValue: 3,  min: 1, max: 20 },
        { id: 'filterStop', label: 'Filter common stopwords', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
