'use client';
import { TextTool } from '@/components/tool/TextTool';
import { SubtitleCuePreview } from '@/components/tool/SubtitleCuePreview';
import { parse, write, stripTags } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-style-editor"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      fileAccept=".srt,.vtt,.ass,.ssa,.sub,.txt"
      downloadExt="srt"
      preview={(out) => <SubtitleCuePreview text={out} />}
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const color = String(o.color ?? '');
        const useColor = Boolean(color && color !== '#000000' && color !== '#ffffff');
        const styled = cues.map((c) => {
          let t = o.stripExisting ? stripTags(c.text) : c.text;
          if (o.bold)   t = `<b>${t}</b>`;
          if (o.italic) t = `<i>${t}</i>`;
          if (o.underline) t = `<u>${t}</u>`;
          if (useColor) t = `<font color="${color}">${t}</font>`;
          return { ...c, text: t };
        });
        return write(styled, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
      }}
      controls={[
        { id: 'bold',          label: 'Bold',      type: 'toggle', defaultValue: false },
        { id: 'italic',        label: 'Italic',    type: 'toggle', defaultValue: true },
        { id: 'underline',     label: 'Underline', type: 'toggle', defaultValue: false },
        { id: 'color',         label: 'Color (HEX, blank = none)', type: 'text', defaultValue: '#ffeb3b' },
        { id: 'stripExisting', label: 'Strip existing tags first', type: 'toggle', defaultValue: true },
        {
          id: 'outputFormat', label: 'Output', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
