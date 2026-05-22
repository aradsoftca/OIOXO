'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';
import { parseCoord, llToUtm } from '@/engines/gis';

function compute(v: Record<string, string | number>): CalcResult[] {
  const ll = parseCoord(String(v.coord ?? ''));
  if (!ll) return [{ label: 'Enter a coordinate', value: '—', primary: true }];
  const utm = llToUtm(ll);
  return [
    { label: 'Zone',      value: `${utm.zone}${utm.hemisphere}`, primary: true },
    { label: 'Easting',   value: `${utm.easting.toFixed(2)} m` },
    { label: 'Northing',  value: `${utm.northing.toFixed(2)} m` },
    { label: 'MGRS-ish',  value: `${utm.zone}${utm.hemisphere} ${Math.round(utm.easting)} ${Math.round(utm.northing)}` },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="gis-utm"
      colorVar="--color-cat-gis"
      inputs={[
        { id: 'coord', label: 'Lat, Lng', type: 'text', defaultValue: '48.8566, 2.3522' },
      ]}
      compute={compute}
    />
  );
}
