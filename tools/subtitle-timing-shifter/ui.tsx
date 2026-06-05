'use client';
import { TextTool } from '@/components/tool/TextTool';
import { SubtitleCuePreview } from '@/components/tool/SubtitleCuePreview';
import { parse, shift, write } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-timing-shifter"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      fileAccept=".srt,.vtt,.ass,.ssa,.sub,.txt"
      downloadExt="srt"
      preview={(out) => <SubtitleCuePreview text={out} />}
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const ms = Number(o.milliseconds) || 0;
        const direction = o.direction === 'backward' ? -1 : 1;
        const shifted = shift(cues, (ms * direction) / 1000);
        return write(shifted, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
      }}
      controls={[
        {
          id: 'direction', label: 'Direction', type: 'select', defaultValue: 'forward',
          options: [
            { value: 'forward',  label: 'Forward (delay subtitles)' },
            { value: 'backward', label: 'Backward (advance subtitles)' },
          ],
        },
        { id: 'milliseconds', label: 'Milliseconds', type: 'number', defaultValue: 500, min: 0, step: 50 },
        {
          id: 'outputFormat', label: 'Output', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
