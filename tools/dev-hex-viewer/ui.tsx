'use client';
import { TextTool } from '@/components/tool/TextTool';

function hexDump(input: string, perRow = 16): string {
  const bytes = new TextEncoder().encode(input);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += perRow) {
    const slice = bytes.subarray(i, i + perRow);
    const offset = i.toString(16).padStart(8, '0');
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(perRow * 3 - 1, ' ');
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset}  ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}

export default function Tool() {
  return (
    <TextTool
      toolId="dev-hex-viewer"
      colorVar="--color-cat-dev"
      transform={(s, o) => s ? hexDump(s, Number(o.width) || 16) : ''}
      controls={[
        { id: 'width', label: 'Bytes per row', type: 'number', defaultValue: 16, min: 4, max: 64, step: 4 },
      ]}
    />
  );
}
