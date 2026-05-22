'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-add-line-breaks"
      transform={(s, o) => {
        const width = Math.max(1, Number(o.width) || 80);
        if (o.mode === 'words') {
          const n = width;
          const words = s.split(/\s+/);
          const lines: string[] = [];
          for (let i = 0; i < words.length; i += n) lines.push(words.slice(i, i + n).join(' '));
          return lines.join('\n');
        }
        // mode === 'chars' — soft word-wrap at width chars
        return s.split(/\r?\n/).map((paragraph) => {
          const out: string[] = [];
          let buf = '';
          for (const w of paragraph.split(/\s+/)) {
            if (!buf) { buf = w; continue; }
            if (buf.length + 1 + w.length > width) { out.push(buf); buf = w; }
            else buf += ' ' + w;
          }
          if (buf) out.push(buf);
          return out.join('\n');
        }).join('\n');
      }}
      controls={[
        {
          id: 'mode', label: 'Wrap by', type: 'select', defaultValue: 'chars',
          options: [
            { value: 'chars', label: 'Characters per line' },
            { value: 'words', label: 'Words per line' },
          ],
        },
        { id: 'width', label: 'Width', type: 'number', defaultValue: 80, min: 1, max: 1000 },
      ]}
    />
  );
}
