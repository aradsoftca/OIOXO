'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-sort-lines"
      transform={(s, o) => {
        const lines = s.split(/\r?\n/);
        const reverse = Boolean(o.reverse);
        const ci = Boolean(o.caseInsensitive);
        const mode = String(o.mode);
        const cmp =
          mode === 'length'
            ? (a: string, b: string) => a.length - b.length
            : mode === 'numeric'
              ? (a: string, b: string) => (parseFloat(a) || 0) - (parseFloat(b) || 0)
              : (a: string, b: string) => (ci ? a.toLowerCase() : a).localeCompare(ci ? b.toLowerCase() : b);
        const out = lines.slice().sort(cmp);
        return (reverse ? out.reverse() : out).join('\n');
      }}
      controls={[
        {
          id: 'mode', label: 'Order by', type: 'select', defaultValue: 'alpha',
          options: [
            { value: 'alpha',   label: 'Alphabetical' },
            { value: 'length',  label: 'Length' },
            { value: 'numeric', label: 'Numeric' },
          ],
        },
        { id: 'reverse',         label: 'Reverse', type: 'toggle', defaultValue: false },
        { id: 'caseInsensitive', label: 'Case-insensitive', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
