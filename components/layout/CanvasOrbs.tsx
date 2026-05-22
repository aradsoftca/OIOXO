/**
 * CanvasOrbs — five large, blurred, drifting color spots behind the app.
 * Pure CSS, GPU-only. Provides cinematic depth without distracting from tiles.
 *
 * The orb classes and keyframes live in globals.css so we don't ship duplicate
 * styles. This component is just placement.
 */
export function CanvasOrbs() {
  return (
    <div className="orbs" aria-hidden>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
      <div className="orb orb-5" />
    </div>
  );
}
