'use client';
import { TextTool } from '@/components/tool/TextTool';

export default function Tool() {
  return (
    <TextTool
      toolId="game-drop-rate"
      colorVar="--color-cat-game"
      initialInput=" "
      transform={(_, o) => {
        const p = Math.max(0.0001, Math.min(100, parseFloat(String(o.rate ?? '1')) || 1)) / 100;
        const n = Math.max(1, Math.min(1e9, parseInt(String(o.attempts ?? '100'), 10) || 100));
        const atLeastOne = (1 - Math.pow(1 - p, n)) * 100;
        const expected = 1 / p;
        const triesFor = (target: number) => Math.ceil(Math.log(1 - target) / Math.log(1 - p));
        return [
          `Drop chance:        ${(p * 100).toFixed(4)}% per attempt`,
          `Attempts:           ${n}`,
          ``,
          `P(at least one):    ${atLeastOne.toFixed(2)}%  in ${n} attempts`,
          `Expected attempts:  ${expected.toFixed(1)}  (average until first drop)`,
          ``,
          `Attempts for 50%:   ${triesFor(0.5)}`,
          `Attempts for 90%:   ${triesFor(0.9)}`,
          `Attempts for 99%:   ${triesFor(0.99)}`,
          ``,
          `Note: each attempt is independent — "due for a drop" is a myth (gambler's fallacy).`,
        ].join('\n');
      }}
      controls={[
        { id: 'rate', label: 'Drop rate % per attempt', type: 'text', defaultValue: '1' },
        { id: 'attempts', label: 'Attempts (tries)', type: 'text', defaultValue: '100' },
      ]}
    />
  );
}
