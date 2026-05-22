'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-url-encode"
      transform={(s, o) => Boolean(o.componentSafe)
        ? encodeURIComponent(s)
        : encodeURI(s)}
      controls={[
        { id: 'componentSafe', label: 'Encode all special chars (component-safe)', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
