'use client';
import { TextTool } from '@/components/tool/TextTool';
import { SubtitleCuePreview } from '@/components/tool/SubtitleCuePreview';
import { parse, write, stripTags } from '@/engines/subtitle';

export default function Tool() {
  return (
    <TextTool
      toolId="subtitle-cleaner"
      colorVar="--color-cat-subtitle"
      inputPlaceholder="Paste SRT or WebVTT…"
      fileAccept=".srt,.vtt,.ass,.ssa,.sub,.txt"
      downloadExt="srt"
      preview={(out) => <SubtitleCuePreview text={out} />}
      transform={(s, o) => {
        if (!s.trim()) return '';
        const cues = parse(s);
        if (cues.length === 0) return 'No cues found.';
        const cleaned = cues.map((c) => {
          let t = c.text;
          if (o.stripTags) t = stripTags(t);
          if (o.normalizeQuotes) t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
          if (o.normalizeDashes) t = t.replace(/—/g, '--').replace(/–/g, '-');
          if (o.removeMusic)    t = t.replace(/[♪♫🎵🎶][^♪♫🎵🎶\n]*[♪♫🎵🎶]/g, '').replace(/\[(music|♪|MUSIC)[^\]]*\]/gi, '');
          if (o.removeBrackets) t = t.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
          if (o.removeSpeaker)  t = t.replace(/^[A-Z][A-Z\s]+:\s*/gm, '');
          if (o.collapseSpaces) t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
          return { ...c, text: t.trim() };
        }).filter((c) => c.text.length > 0);
        return write(cleaned, { format: o.outputFormat === 'vtt' ? 'vtt' : 'srt' });
      }}
      controls={[
        { id: 'stripTags',       label: 'Strip HTML/ASS styling tags', type: 'toggle', defaultValue: true },
        { id: 'normalizeQuotes', label: 'Normalize curly quotes',      type: 'toggle', defaultValue: true },
        { id: 'normalizeDashes', label: 'Normalize em/en dashes',      type: 'toggle', defaultValue: false },
        { id: 'removeMusic',     label: 'Remove music notes',          type: 'toggle', defaultValue: true },
        { id: 'removeBrackets',  label: 'Remove [sounds] and (asides)', type: 'toggle', defaultValue: false },
        { id: 'removeSpeaker',   label: 'Remove SPEAKER: prefixes',    type: 'toggle', defaultValue: false },
        { id: 'collapseSpaces',  label: 'Collapse spaces / blank lines', type: 'toggle', defaultValue: true },
        {
          id: 'outputFormat', label: 'Output format', type: 'select', defaultValue: 'srt',
          options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
        },
      ]}
    />
  );
}
