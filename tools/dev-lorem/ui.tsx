'use client';

import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute ' +
  'irure dolor reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ' +
  'excepteur sint occaecat cupidatat non proident sunt in culpa officia deserunt mollit ' +
  'anim id est laborum').split(/\s+/);

function pick(rng: () => number) {
  return WORDS[Math.floor(rng() * WORDS.length)];
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(_: string, options: Record<string, unknown>, seed: number): string {
  const unit = String(options['unit'] ?? 'paragraphs');
  const count = Math.max(1, Math.min(200, Number(options['count'] ?? 3)));
  const startClassic = Boolean(options['startClassic']);
  const rng = mulberry32(seed);

  const word = () => pick(rng);
  const sentence = () => {
    const n = 6 + Math.floor(rng() * 14);
    const ws = Array.from({ length: n }, word);
    ws[0] = ws[0].charAt(0).toUpperCase() + ws[0].slice(1);
    return ws.join(' ') + '.';
  };
  const paragraph = () => {
    const n = 3 + Math.floor(rng() * 4);
    return Array.from({ length: n }, sentence).join(' ');
  };

  let out: string;
  if (unit === 'words') {
    out = Array.from({ length: count }, word).join(' ');
  } else if (unit === 'sentences') {
    out = Array.from({ length: count }, sentence).join(' ');
  } else {
    out = Array.from({ length: count }, paragraph).join('\n\n');
  }
  if (startClassic) out = 'Lorem ipsum dolor sit amet, ' + out;
  return out;
}

export default function LoremTool() {
  const [seed, setSeed] = React.useState(() => Math.floor(Math.random() * 1e9));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Regenerate
        </button>
      </div>
      <TextTool
        key={seed}
        toolId="dev-lorem"
        transform={(input, options) => gen(input, options, seed)}
        colorVar="--color-cat-dev"
        controls={[
          {
            id: 'unit',
            label: 'Generate',
            type: 'select',
            defaultValue: 'paragraphs',
            options: [
              { value: 'words', label: 'Words' },
              { value: 'sentences', label: 'Sentences' },
              { value: 'paragraphs', label: 'Paragraphs' },
            ],
          },
          { id: 'count', label: 'Count', type: 'number', defaultValue: 3, min: 1, max: 200 },
          { id: 'startClassic', label: 'Start with "Lorem ipsum"', type: 'toggle', defaultValue: true },
        ]}
        initialInput=" "
      />
    </div>
  );
}
