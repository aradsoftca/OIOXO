'use client';
import { TextTool } from '@/components/tool/TextTool';
import { formatXml } from '@/engines/dev/xml';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-xml-format"
      colorVar="--color-cat-dev"
      transform={(s, o) => s.trim() ? formatXml(s, Number(o.indent) || 2) : ''}
      controls={[
        { id: 'indent', label: 'Indent', type: 'number', defaultValue: 2, min: 0, max: 8 },
      ]}
    />
  );
}
