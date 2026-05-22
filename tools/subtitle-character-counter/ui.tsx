'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parse, stripTags } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-character-counter"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      transform={(s, o) => {
        if (!s.trim()) return 'Paste a subtitle file to analyze.';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const maxCps = Number(o.maxCps) || 21;
        const maxLine = Number(o.maxLineChars) || 42;
        const rows = cues.map((c) => {
          const text = stripTags(c.text);
          const dur = Math.max(0.01, c.end - c.start);
          const chars = text.replace(/\n/g, '').length;
          const cps = chars / dur;
          const longest = Math.max(...text.split('\n').map((l) => l.length));
          const flag = cps > maxCps || longest > maxLine ? '⚠' : '·';
          return `${String(c.index).padStart(4)}  ${flag} ${chars.toString().padStart(4)}ch ${cps.toFixed(1).padStart(5)} cps  L${longest}`;
        });
        const totalChars = cues.reduce((a, c) => a + stripTags(c.text).replace(/\n/g, '').length, 0);
        const totalDur = cues.reduce((a, c) => a + (c.end - c.start), 0);
        const avgCps = totalChars / Math.max(0.01, totalDur);
        const overCps = cues.filter((c) => {
          const text = stripTags(c.text).replace(/\n/g, '');
          return text.length / Math.max(0.01, c.end - c.start) > maxCps;
        }).length;
        const overLine = cues.filter((c) => Math.max(...stripTags(c.text).split('\n').map((l) => l.length)) > maxLine).length;
        return [
          `Total cues: ${cues.length}`,
          `Total chars: ${totalChars}  ·  Avg CPS: ${avgCps.toFixed(2)}`,
          `Over ${maxCps} CPS: ${overCps}  ·  Over ${maxLine}-char lines: ${overLine}`,
          '',
          '#  ⚠  chars   cps    longest',
          '─'.repeat(34),
          ...rows,
        ].join('\n');
      }}
      controls={[
        { id: 'maxCps',       label: 'Max chars/sec', type: 'number', defaultValue: 21, min: 5,  max: 50 },
        { id: 'maxLineChars', label: 'Max line width', type: 'number', defaultValue: 42, min: 20, max: 80 },
      ]}
    />
  );
}
