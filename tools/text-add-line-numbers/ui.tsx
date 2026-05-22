'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-add-line-numbers"
      transform={(s, o) => {
        const start = Number(o.start) || 1;
        const pad = Number(o.pad) || 0;
        const sep = String(o.separator ?? '. ');
        const lines = s.split(/\r?\n/);
        return lines.map((l, i) => {
          const n = String(start + i).padStart(pad, '0');
          return n + sep + l;
        }).join('\n');
      }}
      controls={[
        { id: 'start',     label: 'Start at',  type: 'number', defaultValue: 1,   min: 0 },
        { id: 'pad',       label: 'Pad width', type: 'number', defaultValue: 0,   min: 0, max: 8 },
        { id: 'separator', label: 'Separator', type: 'text',   defaultValue: '. ' },
      ]}
    />
  );
}
