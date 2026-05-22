'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';
import { parseCoord, haversine, bearing } from '@/engines/gis';

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = parseCoord(String(v.from ?? ''));
  const b = parseCoord(String(v.to ?? ''));
  if (!a || !b) return [{ label: 'Enter both coordinates', value: '—', primary: true }];
  const meters = haversine(a, b);
  const km = meters / 1000;
  const miles = km / 1.609344;
  const nm = km / 1.852;
  const brg = bearing(a, b);
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const compassDir = compass[Math.round(brg / 45) % 8];
  return [
    { label: 'Distance', value: `${km.toFixed(2)} km`, primary: true, hint: `${miles.toFixed(2)} mi  ·  ${nm.toFixed(2)} nm` },
    { label: 'Meters',   value: meters.toFixed(0) + ' m' },
    { label: 'Bearing',  value: `${brg.toFixed(1)}° (${compassDir})` },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="gis-distance"
      colorVar="--color-cat-gis"
      inputs={[
        { id: 'from', label: 'From', type: 'text', defaultValue: '37.7749, -122.4194' },
        { id: 'to',   label: 'To',   type: 'text', defaultValue: '40.7128, -74.0060' },
      ]}
      compute={compute}
    />
  );
}
