'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parse, toPlainText, stripTags } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-to-plain-text"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      fileAccept=".srt,.vtt,.ass,.ssa,.sub,.txt"
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const sep = o.layout === 'paragraph' ? '\n\n' : '\n';
        if (o.layout === 'numbered') {
          return cues.map((c, i) => `${i + 1}. ${stripTags(c.text).replace(/\n/g, ' ')}`).join('\n');
        }
        if (o.layout === 'timestamped') {
          return cues.map((c) => `[${c.start.toFixed(1)}s] ${stripTags(c.text).replace(/\n/g, ' ')}`).join('\n');
        }
        return toPlainText(cues, sep);
      }}
      controls={[
        {
          id: 'layout', label: 'Layout', type: 'select', defaultValue: 'oneLine',
          options: [
            { value: 'oneLine',     label: 'One cue per line' },
            { value: 'paragraph',   label: 'One cue per paragraph' },
            { value: 'numbered',    label: 'Numbered list' },
            { value: 'timestamped', label: 'With timestamps' },
          ],
        },
      ]}
    />
  );
}
