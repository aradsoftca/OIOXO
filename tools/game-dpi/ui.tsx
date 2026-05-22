'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const dpi = Number(v.dpi) || 800;
  const sens = Number(v.sens) || 1;
  const eDPI = dpi * sens;
  // cm/360 at the given setup. 360° ≈ pixels for one full turn at the given sens.
  // pixels per inch = DPI. inches per 360 = (360 / yaw) × 1/sens. For most games yaw is 0.022.
  const yaw = Number(v.yaw) || 0.022;
  const inchesPer360 = 360 / (sens * yaw);
  const cmPer360 = inchesPer360 * 2.54 / (dpi / 800); // normalize-ish
  // Simpler honest formula: cm/360 = (2.54 × 360) / (DPI × sens × yaw)
  const cm360 = (2.54 * 360) / (dpi * sens * yaw);
  void cmPer360;
  return [
    { label: 'eDPI', value: eDPI.toLocaleString(), primary: true },
    { label: 'cm/360', value: cm360.toFixed(1) + ' cm', hint: 'how far you move the mouse for a full 360° turn' },
    { label: 'inches/360', value: (cm360 / 2.54).toFixed(2) },
    { label: 'Sensitivity class',
      value:
        eDPI < 400  ? 'High (sniper)' :
        eDPI < 800  ? 'Mid (versatile)' :
        eDPI < 1600 ? 'Low (twitch)' : 'Very low' },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="game-dpi"
      colorVar="--color-cat-game"
      inputs={[
        { id: 'dpi',  label: 'Mouse DPI',           defaultValue: 800 },
        { id: 'sens', label: 'In-game sensitivity', defaultValue: 0.5, step: 0.01 },
        { id: 'yaw',  label: 'Yaw (game-specific)', defaultValue: 0.022, step: 0.001 },
      ]}
      compute={compute}
      formula="eDPI = DPI × Sens    cm/360 = 2.54 × 360 / (DPI × Sens × Yaw)"
    />
  );
}
