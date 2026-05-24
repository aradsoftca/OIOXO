/**
 * oioxo brand UI — the wordmark + motion, rebuilt as SVG from the logo so it
 * scales crisply and animates. Palette: ink (near-black), gold accent, white.
 * The loader is derived from the mark's geometry (a gold arc sweeping a ring +
 * the pulsing i-dot) so motion feels like part of the identity, not generic.
 */
import * as React from 'react';

export const INK = '#232327';
export const GOLD = '#E2B24A';
const GOLD_GLOW = (px: number) => ({ filter: `drop-shadow(0 0 ${px}px rgba(226,178,74,0.75))` });

// Geometry helpers: polar point + an arc path (clockwise) between two angles,
// angles measured from 3 o'clock, increasing clockwise (SVG y-down).
const CY = 100;
const R = 56;
function polar(cx: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + R * Math.cos(a), CY + R * Math.sin(a)];
}
function arc(cx: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, a0);
  const [x1, y1] = polar(cx, a1);
  const sweep = (((a1 - a0) % 360) + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * The exact oioxo wordmark, monoline with directional stencil gaps:
 *  o(gap right) · i(stem + gold dot) · o(gold upper-left, gap right) · x(gold) · o(gap left)
 */
export function OioxoMark({ className = 'h-7 w-auto', ink = INK }: { className?: string; ink?: string }) {
  const sw = 11;
  const O1 = 68, IX = 158, O2 = 270, XX = 372, O5 = 492; // glyph x-centers
  const G = 55; // gap size (deg)
  return (
    <svg viewBox="0 0 560 200" className={className} role="img" aria-label="oioxo" fill="none">
      <g stroke={ink} strokeWidth={sw} strokeLinecap="round">
        {/* o1 — gap on the right */}
        <path d={arc(O1, G / 2, 360 - G / 2)} />
        {/* i stem */}
        <line x1={IX} y1={48} x2={IX} y2={152} />
        {/* o2 — charcoal lower arc (below the gold) + small top-right arc */}
        <path d={arc(O2, G / 2, 180)} />
        <path d={arc(O2, 285, 360 - G / 2)} />
        {/* o5 — gap on the left */}
        <path d={arc(O5, 180 + G / 2, 180 - G / 2 + 360)} />
      </g>

      {/* gold accents: i-dot, o2 upper-left arc, the x */}
      <g stroke={GOLD} strokeWidth={sw} strokeLinecap="round" style={GOLD_GLOW(6)}>
        <path d={arc(O2, 180, 285)} fill="none" />
        <line x1={XX - 32} y1={CY - 34} x2={XX + 32} y2={CY + 34} />
        <line x1={XX + 32} y1={CY - 34} x2={XX - 32} y2={CY + 34} />
      </g>
      <circle cx={IX} cy={26} r={11} fill={GOLD} style={GOLD_GLOW(6)} />
    </svg>
  );
}

/** Branded spinner — a gold arc sweeping a faint ink ring, with a glow. */
export function OioxoLoader({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`oio-spin ${className}`} role="status" aria-label="Loading" fill="none">
      <circle cx={20} cy={20} r={15} stroke={INK} strokeOpacity={0.12} strokeWidth={4} />
      <path d="M20 5 A15 15 0 0 1 35 20" stroke={GOLD} strokeWidth={4} strokeLinecap="round" style={GOLD_GLOW(3)} />
    </svg>
  );
}

/** Three pulsing gold dots — for the "thinking" state, echoing the i-dot. */
export function OioxoThinking() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="oio-pulse h-1.5 w-1.5 rounded-full"
          style={{ background: GOLD, animationDelay: `${i * 0.16}s`, ...GOLD_GLOW(3) }}
        />
      ))}
    </div>
  );
}
