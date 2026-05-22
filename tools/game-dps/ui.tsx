'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const dmg = Number(v.damage) || 0;
  const fireRate = Number(v.fireRate) || 1;
  const critChance = (Number(v.critChance) || 0) / 100;
  const critMult = Number(v.critMult) || 2;
  const armorReduce = (Number(v.armor) || 0) / 100;

  const effectiveDmg = dmg * (1 - armorReduce);
  const avgDmg = effectiveDmg * (1 + critChance * (critMult - 1));
  const dps = avgDmg * fireRate;
  return [
    { label: 'DPS', value: dps.toFixed(1), primary: true, hint: `avg hit × ${fireRate}/sec` },
    { label: 'Average hit',     value: avgDmg.toFixed(1) },
    { label: 'Normal hit',      value: effectiveDmg.toFixed(1) },
    { label: 'Critical hit',    value: (effectiveDmg * critMult).toFixed(1) },
    { label: 'Armor reduction', value: `${(armorReduce * 100).toFixed(0)}%` },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="game-dps"
      colorVar="--color-cat-game"
      inputs={[
        { id: 'damage',     label: 'Base damage',  defaultValue: 80 },
        { id: 'fireRate',   label: 'Fire rate',    unit: '/sec', defaultValue: 5 },
        { id: 'critChance', label: 'Crit chance',  unit: '%', defaultValue: 25 },
        { id: 'critMult',   label: 'Crit multiplier', unit: '×', defaultValue: 2 },
        { id: 'armor',      label: 'Target armor', unit: '%', defaultValue: 0 },
      ]}
      compute={compute}
      formula="DPS = Damage × (1 − Armor) × (1 + Crit% × (Mult − 1)) × FireRate"
    />
  );
}
