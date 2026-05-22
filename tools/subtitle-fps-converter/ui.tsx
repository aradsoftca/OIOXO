'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parse, scale, write } from '@/engines/subtitle';

const RATES = [
  { value: '23.976', label: '23.976 (NTSC film)' },
  { value: '24',     label: '24 (cinema)' },
  { value: '25',     label: '25 (PAL)' },
  { value: '29.97',  label: '29.97 (NTSC video)' },
  { value: '30',     label: '30' },
  { value: '50',     label: '50' },
  { value: '59.94',  label: '59.94' },
  { value: '60',     label: '60' },
];

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-fps-converter"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const from = Number(o.fromFps) || 23.976;
        const to   = Number(o.toFps)   || 25;
        const factor = from / to;
        const scaled = scale(cues, factor);
        return write(scaled, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
      }}
      controls={[
        { id: 'fromFps', label: 'Source FPS', type: 'select', defaultValue: '23.976', options: RATES },
        { id: 'toFps',   label: 'Target FPS', type: 'select', defaultValue: '25',     options: RATES },
        {
          id: 'outputFormat', label: 'Output', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
