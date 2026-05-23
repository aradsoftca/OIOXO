/**
 * Xonvert AI — inline CSS / code generators.
 *
 * The gen-* CSS tools produce a snippet of CSS, which is pure text — so the AI
 * can just hand it back in the chat (ready to copy) instead of opening a page.
 * Colours are pulled from the message via the colour-ops parser; everything else
 * comes from light keyword parsing with sensible defaults. Pure / DOM-free.
 */

import { findColors } from './color-ops';
import { toHex } from '@/engines/color';

const hexes = (msg: string) => findColors(msg).map(toHex);
function angleOf(msg: string, def = 135): number {
  const m = msg.match(/(\d{1,3})\s*deg/);
  if (m) return +m[1];
  if (/\bto right|horizontal\b/i.test(msg)) return 90;
  if (/\bto left\b/i.test(msg)) return 270;
  if (/\bto bottom|vertical|downward?\b/i.test(msg)) return 180;
  if (/\bto top|upward?\b/i.test(msg)) return 0;
  return def;
}

export interface CssOp { verb: string; run: (message: string) => string }

export const CSS_OPS: Record<string, CssOp> = {
  'gen-gradient': { verb: 'build a gradient', run: (m) => {
    const c = hexes(m); const cols = c.length >= 2 ? c : ['#6366f1', '#ec4899'];
    return /radial|circle/i.test(m)
      ? `background: radial-gradient(circle at center, ${cols.join(', ')});`
      : `background: linear-gradient(${angleOf(m)}deg, ${cols.join(', ')});`;
  } },
  'gen-mesh-gradient': { verb: 'build a mesh gradient', run: (m) => {
    const c = hexes(m); const cols = c.length >= 3 ? c : ['#6366f1', '#ec4899', '#22d3ee', '#f59e0b'];
    const at = [['10', '20'], ['90', '30'], ['30', '80'], ['70', '70']];
    const stops = cols.map((col, i) => `radial-gradient(at ${at[i % 4][0]}% ${at[i % 4][1]}%, ${col} 0px, transparent 50%)`);
    return `background-color: ${cols[0]};\nbackground-image: ${stops.join(',\n  ')};`;
  } },
  'gen-box-shadow': { verb: 'build a box shadow', run: (m) => {
    const soft = /soft|subtle|light/i.test(m);
    return `box-shadow: 0 ${soft ? '2px 8px' : '8px 24px'} rgba(0, 0, 0, ${soft ? '0.08' : '0.18'});`;
  } },
  'gen-css-text-shadow': { verb: 'build a text shadow', run: (m) => {
    const col = hexes(m)[0] ?? '#000000';
    return `text-shadow: 0 2px 4px ${col}59;`;
  } },
  'gen-css-filter': { verb: 'build a CSS filter', run: (m) => {
    const parts: string[] = [];
    const b = m.match(/blur\s*(\d+)/i); if (b || /blur/i.test(m)) parts.push(`blur(${b ? b[1] : 4}px)`);
    const br = m.match(/bright\w*\s*(\d+)/i); if (br) parts.push(`brightness(${+br[1] / 100})`);
    const ct = m.match(/contrast\s*(\d+)/i); if (ct) parts.push(`contrast(${+ct[1] / 100})`);
    if (/grayscale|greyscale|black and white/i.test(m)) parts.push('grayscale(1)');
    if (/sepia/i.test(m)) parts.push('sepia(1)');
    return `filter: ${parts.length ? parts.join(' ') : 'blur(4px) brightness(1.1)'};`;
  } },
  'gen-glassmorphism': { verb: 'build a glassmorphism style', run: () =>
    'background: rgba(255, 255, 255, 0.15);\nbackdrop-filter: blur(12px);\n-webkit-backdrop-filter: blur(12px);\nborder: 1px solid rgba(255, 255, 255, 0.25);\nborder-radius: 16px;' },
  'gen-css-transform': { verb: 'build a CSS transform', run: (m) => {
    const parts: string[] = [];
    const r = m.match(/rotate\s*(-?\d+)/i); if (r || /rotate/i.test(m)) parts.push(`rotate(${r ? r[1] : 45}deg)`);
    const s = m.match(/scale\s*(\d+(?:\.\d+)?)/i); if (s) parts.push(`scale(${s[1]})`);
    const t = m.match(/translate\w*\s*(-?\d+)/i); if (t) parts.push(`translate(${t[1]}px)`);
    if (/skew/i.test(m)) parts.push('skew(10deg)');
    return `transform: ${parts.length ? parts.join(' ') : 'rotate(45deg) scale(1.1)'};`;
  } },
  'gen-flexbox': { verb: 'build a flexbox layout', run: (m) =>
    `display: flex;\nflex-direction: ${/column|vertical/i.test(m) ? 'column' : 'row'};\njustify-content: ${/center/i.test(m) ? 'center' : 'space-between'};\nalign-items: center;\ngap: 1rem;` },
  'gen-grid': { verb: 'build a grid layout', run: (m) => {
    const n = m.match(/(\d+)\s*column/i);
    return `display: grid;\ngrid-template-columns: repeat(${n ? +n[1] : 3}, 1fr);\ngap: 1rem;`;
  } },
};

export function cssOpFor(id: string): CssOp | undefined { return CSS_OPS[id]; }
export const CSS_IDS = Object.keys(CSS_OPS);
export const CSS_TRIGGER = /\b(gradient|box[ -]?shadow|text[ -]?shadow|glass ?morphism|css filter|flex ?box|css grid|css transform|grid layout)\b/i;
