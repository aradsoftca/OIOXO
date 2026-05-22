'use client';
import { TextTool } from '@/components/tool/TextTool';
import { htmlEncode, htmlDecode } from '@/engines/text';
export default function Tool() {
  return (
    <TextTool
      toolId="text-html-encode"
      transform={(s, o) => o.direction === 'decode' ? htmlDecode(s) : htmlEncode(s)}
      controls={[
        {
          id: 'direction', label: 'Direction', type: 'select', defaultValue: 'encode',
          options: [
            { value: 'encode', label: 'Encode (text → entities)' },
            { value: 'decode', label: 'Decode (entities → text)' },
          ],
        },
      ]}
    />
  );
}
