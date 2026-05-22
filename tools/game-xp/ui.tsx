'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function xpForLevel(level: number, base: number, exponent: number): number {
  return Math.round(base * Math.pow(level, exponent));
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const from = Math.max(1, Number(v.fromLevel) || 1);
  const to   = Math.max(from + 1, Number(v.toLevel) || 2);
  const base = Number(v.baseXp) || 100;
  const exp  = Number(v.exponent) || 1.5;
  const perHour = Math.max(1, Number(v.xpPerHour) || 50000);

  let total = 0;
  for (let lvl = from; lvl < to; lvl++) total += xpForLevel(lvl, base, exp);
  const hours = total / perHour;
  return [
    { label: 'Total XP', value: total.toLocaleString(), primary: true },
    { label: 'Hours required', value: hours.toFixed(1) + ' h', hint: `at ${perHour.toLocaleString()} XP/hr` },
    { label: 'Days @ 2 hr/day',  value: (hours / 2).toFixed(1) + ' days' },
    { label: 'XP for next level', value: xpForLevel(from, base, exp).toLocaleString() },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="game-xp"
      colorVar="--color-cat-game"
      inputs={[
        { id: 'fromLevel', label: 'From level',   defaultValue: 1 },
        { id: 'toLevel',   label: 'To level',     defaultValue: 60 },
        { id: 'baseXp',    label: 'Base XP for level 1', defaultValue: 100 },
        { id: 'exponent',  label: 'Curve exponent', defaultValue: 1.5 },
        { id: 'xpPerHour', label: 'XP per hour',  defaultValue: 50000 },
      ]}
      compute={compute}
      formula="XP(lvl) = base × lvl^exponent"
    />
  );
}
