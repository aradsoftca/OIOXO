'use client';
import { TextTool } from '@/components/tool/TextTool';
import { toSentenceCase } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-sentence-case" transform={(s) => toSentenceCase(s)} />;
}
