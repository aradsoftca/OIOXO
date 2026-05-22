'use client';
import { TextTool } from '@/components/tool/TextTool';
import { rot13 } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-rot13" transform={(s) => rot13(s)} />;
}
