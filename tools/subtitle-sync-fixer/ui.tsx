'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parse, parseTime, write } from '@/engines/subtitle';

function asSec(input: string): number {
  const s = input.trim();
  if (!s) return Number.NaN;
  const t = parseTime(s);
  return Number.isNaN(t) ? Number(s) : t;
}

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-sync-fixer"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';

        if (o.mode === 'twoPoint') {
          // Two-point sync: map (firstCueOld → firstCueNew) and (lastCueOld → lastCueNew).
          const oldFirst = cues[0].start;
          const oldLast  = cues[cues.length - 1].start;
          const newFirst = asSec(String(o.firstNew ?? ''));
          const newLast  = asSec(String(o.lastNew  ?? ''));
          if (!Number.isFinite(newFirst) || !Number.isFinite(newLast) || oldLast === oldFirst) {
            return 'Provide valid new timestamps for first and last cues.';
          }
          const factor = (newLast - newFirst) / (oldLast - oldFirst);
          const mapped = cues.map((c) => {
            const start = newFirst + (c.start - oldFirst) * factor;
            const end   = newFirst + (c.end   - oldFirst) * factor;
            return { ...c, start: Math.max(0, start), end: Math.max(0, end) };
          });
          return write(mapped, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
        }

        // Simple shift + stretch
        const shiftSec = Number(o.shift) || 0;
        const factor   = Number(o.stretch) || 1;
        const out = cues.map((c) => ({
          ...c,
          start: Math.max(0, c.start * factor + shiftSec),
          end:   Math.max(0, c.end   * factor + shiftSec),
        }));
        return write(out, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
      }}
      controls={[
        {
          id: 'mode', label: 'Mode', type: 'select', defaultValue: 'simple',
          options: [
            { value: 'simple',   label: 'Simple shift + stretch' },
            { value: 'twoPoint', label: 'Two-point anchor (first + last)' },
          ],
        },
        { id: 'shift',    label: 'Shift (seconds)',  type: 'number', defaultValue: 0,   step: 0.1 },
        { id: 'stretch',  label: 'Stretch factor',   type: 'number', defaultValue: 1,   step: 0.001 },
        { id: 'firstNew', label: 'First cue should start at', type: 'text', defaultValue: '00:00:05,000' },
        { id: 'lastNew',  label: 'Last cue should start at',  type: 'text', defaultValue: '02:00:00,000' },
        {
          id: 'outputFormat', label: 'Output', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
