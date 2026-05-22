'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';
import { parseCoord, ddToDms, llToUtm } from '@/engines/gis';

function compute(v: Record<string, string | number>): CalcResult[] {
  const input = String(v.coord ?? '').trim();
  if (!input) return [{ label: 'Enter coordinates', value: '—', primary: true, hint: 'Try "37.7749, -122.4194"' }];
  const ll = parseCoord(input);
  if (!ll) return [{ label: 'Could not parse', value: '—', primary: true }];
  const utm = llToUtm(ll);
  return [
    { label: 'Decimal degrees',     value: `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`, primary: true },
    { label: 'DMS',                 value: `${ddToDms(ll.lat, 'lat')}  ${ddToDms(ll.lng, 'lng')}` },
    { label: 'UTM zone',            value: `${utm.zone}${utm.hemisphere}` },
    { label: 'UTM easting',         value: `${utm.easting.toFixed(2)} m` },
    { label: 'UTM northing',        value: `${utm.northing.toFixed(2)} m` },
    { label: 'Google Maps link',    value: `https://maps.google.com/?q=${ll.lat},${ll.lng}` },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="gis-coords"
      colorVar="--color-cat-gis"
      inputs={[
        { id: 'coord', label: 'Coordinate', type: 'text', defaultValue: '37.7749, -122.4194' },
      ]}
      compute={compute}
    />
  );
}
