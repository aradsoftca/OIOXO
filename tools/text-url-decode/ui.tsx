'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="text-url-decode"
      transform={(s) => {
        try { return decodeURIComponent(s); } catch { return decodeURI(s); }
      }}
    />
  );
}
