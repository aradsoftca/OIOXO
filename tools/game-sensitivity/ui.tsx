'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

// Per-game yaw — degrees per sens unit, per inch of mouse travel at 1 DPI.
const YAW: Record<string, number> = {
  'cs2':        0.022,
  'csgo':       0.022,
  'valorant':   0.07,
  'apex':       0.022,
  'overwatch':  0.0066,
  'fortnite':   0.5,
  'r6siege':    0.00223,
  'quake':      0.022,
};

function compute(v: Record<string, string | number>): CalcResult[] {
  const fromGame = String(v.fromGame);
  const toGame   = String(v.toGame);
  const sens     = Number(v.sens);
  const dpi      = Number(v.dpi) || 800;
  const fy = YAW[fromGame];
  const ty = YAW[toGame];
  if (!fy || !ty) return [{ label: 'Pick valid games', value: '—', primary: true }];
  if (!sens) return [{ label: 'Enter sensitivity', value: '—', primary: true }];

  // cm/360 = (2.54 × 360) / (DPI × Sens × Yaw)
  const cm360 = (2.54 * 360) / (dpi * sens * fy);
  const newSens = (2.54 * 360) / (dpi * cm360 * ty);
  return [
    { label: `Sensitivity in ${toGame}`, value: newSens.toFixed(4), primary: true },
    { label: 'cm/360', value: cm360.toFixed(1) + ' cm' },
    { label: 'inches/360', value: (cm360 / 2.54).toFixed(2) },
    { label: 'eDPI (source)', value: (dpi * sens).toLocaleString() },
  ];
}

const GAMES = Object.keys(YAW).map((g) => ({ value: g, label: g.toUpperCase() }));

export default function Tool() {
  return (
    <CalcTool
      toolId="game-sensitivity"
      colorVar="--color-cat-game"
      inputs={[
        { id: 'fromGame', label: 'From game', type: 'select', defaultValue: 'valorant', options: GAMES },
        { id: 'sens',     label: 'Sensitivity in that game', defaultValue: 0.5, step: 0.01 },
        { id: 'dpi',      label: 'Mouse DPI', defaultValue: 800 },
        { id: 'toGame',   label: 'To game',   type: 'select', defaultValue: 'cs2', options: GAMES },
      ]}
      compute={compute}
    />
  );
}
