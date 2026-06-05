'use client';
import { TextTool } from '@/components/tool/TextTool';
import { SubtitleCuePreview } from '@/components/tool/SubtitleCuePreview';
import { parse, parseTime, shift, write } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-splitter"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      fileAccept=".srt,.vtt,.ass,.ssa,.sub,.txt"
      downloadExt="srt"
      preview={(out) => <SubtitleCuePreview text={out} />}
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const rawSplit = String(o.splitAt ?? '00:00:00,000').trim();
        let splitSec = parseTime(rawSplit);
        if (Number.isNaN(splitSec)) splitSec = Number(rawSplit);
        if (!Number.isFinite(splitSec) || splitSec <= 0) return 'Provide a valid split time (HH:MM:SS,mmm or seconds).';
        const first  = cues.filter((c) => c.start <  splitSec);
        let second = cues.filter((c) => c.start >= splitSec);
        if (o.zeroSecond) second = shift(second, -splitSec);
        const fmt = o.outputFormat === 'vtt' ? 'vtt' : 'srt';
        return [
          `─── PART 1 (${first.length} cues) ───`,
          write(first, { format: fmt }),
          `─── PART 2 (${second.length} cues${o.zeroSecond ? ', shifted to start at 0' : ''}) ───`,
          write(second, { format: fmt }),
        ].join('\n');
      }}
      controls={[
        { id: 'splitAt',      label: 'Split at',                  type: 'text',   defaultValue: '00:30:00,000' },
        { id: 'zeroSecond',   label: 'Reset Part 2 to start at 0', type: 'toggle', defaultValue: true },
        {
          id: 'outputFormat', label: 'Output', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
