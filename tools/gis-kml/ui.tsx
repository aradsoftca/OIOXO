'use client';
import { TextTool } from '@/components/tool/TextTool';
import { kmlToGeoJson } from '@/engines/gis';

export default function Tool() {
  return (
    <TextTool
      toolId="gis-kml"
      colorVar="--color-cat-gis"
      inputPlaceholder="Paste KML XML here…"
      transform={(s, o) => {
        if (!s.trim()) return '';
        try {
          const geo = kmlToGeoJson(s);
          return JSON.stringify(geo, null, Number(o.indent) || 2);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        { id: 'indent', label: 'Indent', type: 'number', defaultValue: 2, min: 0, max: 8 },
      ]}
    />
  );
}
